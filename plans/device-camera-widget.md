# Device camera widget (CameraIn)

**Status:** plan only, written 2026-10-09. Nothing built. The Step 0
hardware check has been run (results below) and the camera side passes;
the send-time numbers change the transport design. Part of the
[NTK plans](README.md).

A widget that pulls still frames from the camera on a Seeed XIAO
ESP32-S3 Sense and puts each one on an outlet, so **ObjectRecog can
recognise what the board sees instead of what the computer's webcam
sees.** `CameraIn → ObjectRecog → LLM / SpeechOut / AnalogOut` then
works with the camera out in the room, on the object, on a robot.

## The three pieces

1. **Firmware** captures a JPEG on request and sends it up the existing
   connection.
2. **CameraIn widget** asks for frames, shows a preview, and emits a
   short URL for the latest frame on its outlet.
3. **ObjectRecog** gains an `image` inlet; when something is wired into
   it, it runs on those frames instead of opening the webcam.

## Step 0 - verify before building anything

Everything below rests on things not yet checked on the real board:

- `import espcamera` works on the installed build (CircuitPython 10.3.1,
  `seeed_xiao_esp32_s3_sense`) and `board.CAM_*` pins are all defined.
- A camera can be initialised **after** WiFi is up, from inside the
  running firmware. `code.py` documents two hard-won cases where a call
  (`start_ap()`, `wifi.radio.connect()`) failed only when made from a
  module with a lot of compiled code resident. Camera init allocates
  large framebuffers and may be the same class of problem. If it is,
  init moves into `code.py` next to WiFi setup, gated on a
  `settings.toml` key.
- Capture size and time: QVGA (320x240) JPEG at a middling quality
  setting - expected 6-15 KB and well under 100 ms, but measure.
- Free memory with the camera initialised (boot currently reports about
  8 MB free, so PSRAM is present and this should be comfortable).

A 30-line test script in `firmware/test/` (init, capture, print size
and timing, with WiFi connected) answers all four. If `espcamera` is
missing from the build, stop: the alternative is a custom CircuitPython
build, which is a different project.

### Step 0 results (2026-10-09, XIAO ESP32-S3 Sense, CircuitPython 10.3.1)

Run with `firmware/test/test_camera.py` over the serial REPL, once bare
and once with WiFi joined and `ntk_firmata_main` imported (not running
the server). Same results both ways.

- `espcamera` is in the build; all `board.CAM_*` pins exist. Sensor is
  an **OV2640**.
- Camera init takes **0.24 s** and works with WiFi up and the firmware's
  modules resident - no sign of the start-up-order failure. Not tested:
  init while the server loop is actually running with pins claimed.
- Capture (JPEG quality 12): QQVGA about 1.5 KB in 40 ms, **QVGA about
  3.7 KB in 40 ms**, VGA about 10.6 KB in 80 ms. The scene was whatever
  the board happened to be pointing at; a busy, well-lit scene will be
  larger. Only the JPEG header was checked - nobody has looked at a
  picture yet.
- `gc.mem_free()` stays at about 8.0 MB throughout (the framebuffer
  comes from the IDF heap, so this doesn't show its cost).
- **Sending is the problem.** A second run sent each frame (padded by
  1/7 to stand in for 7-bit encoding) to this Mac over TCP with the
  firmware's own `send_all`, power management off and TCP_NODELAY on,
  RSSI -46:
  - QVGA (about 4.4 KB on the wire): 1-50 ms most of the time, but
    0.2-1.2 s on 4 sends in 10.
  - VGA (about 12 KB on the wire): 0.35-0.9 s every time.
  A frame that fits in the socket's send buffer goes immediately; one
  that doesn't waits on the other end's acknowledgements, and so does a
  small one sent while the previous is still unacknowledged. One
  network, one afternoon, ten samples each - indicative, not a spec.

- **A frame from this camera is good enough for ObjectRecog.** A
  320x240 frame of a pair of scissors on a desk (6.6 KB, dim room, no
  sensor tuning), loaded through ObjectRecog's "test with an image
  file" button, was recognised as scissors (reported by Phil,
  2026-10-09). One object, one frame, a plain background - the easy
  case - but it settles whether QVGA from this sensor is usable at all.
  Earlier frames in the same room were dark with a green-yellow cast;
  exposure and white-balance settings are untried.

**What this changes:** a blocking send per frame would freeze pin
handling for up to a second. So the frame must be sent **without
blocking** - handed to the socket a piece at a time across loop passes,
resuming where it left off - which means the firmware needs a small
outgoing queue so a half-sent camera chunk and an ordinary Firmata
message can't interleave mid-message. That is the main new piece of
firmware work, and it applies equally to the HTTP alternative. QVGA is
the practical default; VGA is offered only with a "slow" warning, if at
all.

## Transport: on the existing Firmata connection

**Recommended: a new sysex pair, `CAMERA_FRAME_REQUEST` /
`CAMERA_FRAME_REPLY`,** next to the existing custom messages in
`firmata_server.py`. Ids 0x01-0x0E of the 0x01-0x0F custom range are
already taken, leaving only 0x0F - so use **one id for both directions**
(host -> device is always a request, device -> host always a reply), or
widen the custom range; decide when writing it.

- Request: resolution preset and JPEG quality, one byte each.
- Reply: the JPEG split into chunks (about 1 KB of image each), every
  chunk carrying frame id, chunk index and chunk count, 7-bit encoded
  like the other payloads. A first chunk with count 0 is an error reply
  with a reason code (no camera, capture failed, out of memory).
- Host side: `StandardFirmataModel.js` registers a sysex handler the
  same way the Grove reply is registered, reassembles chunks, drops a
  frame whose chunks don't all arrive, and hands the finished buffer to
  the server.

Why this and not a small HTTP server on a second port (which would be
simpler to write and faster): the board serves **one connection at a
time** and its three service loops (idle/standalone, controlled,
monitored) each poll one socket. A second listening socket means
servicing it from all three, and it reintroduces the "who holds the
device" questions the status bar and Monitor mode exist to answer. On
the Firmata connection the camera is simply one more thing a controlled
device can do.

Cost to accept: a frame takes anywhere from a few milliseconds to about
a second to get out (see the Step 0 results), and must be sent without
blocking so pins keep being serviced meanwhile. This is a
**stills-at-a-modest-rate** design, not video: default 1 frame/s, and
the next frame is not captured until the previous one has fully left.

## CameraIn widget

- **typeID** `CameraIn`, category alongside the other hardware inputs,
  base class `WidgetMulti`.
- **Device fields** (network device, server, port) and the connect
  checkbox, exactly as AnalogIn has them, so it picks up the toolbar's
  default device.
- **Inlet** `trigger`: a rising edge through the threshold takes one
  picture (same convention as SpeechIn's trigger).
- **Outlet** `image`: a string, the URL of the latest frame (see below).
- **Body:** a small live preview of the last frame, an **aim** button
  (see "Aim mode" below), and a status line ("waiting", "capturing",
  "aiming", "no camera", frame age). Per the widget
  design principles, the body shows what is happening.
- **More panel:** mode (**interval** / **on trigger**), interval in ms
  (default 1000, minimum 250), resolution (QQVGA 160x120 / QVGA 320x240
  / VGA 640x480; default QVGA), JPEG quality, a "take picture" button,
  and "save image…".
- **Testable with no hardware:** a "use this computer's camera instead"
  option (and/or "use an image file…", reusing ObjectRecog's existing
  picker). Same outlet, same downstream behaviour, so a patch can be
  built and tried before a board is involved.

### Aim mode (preview for pointing the camera)

Found while doing the Step 0 check: without a live picture it took three
blind captures to get one usable angle. Aiming the camera is the first
thing anyone does with this widget, so it needs a preview that keeps up
with a hand moving the board - the normal one-frame-a-second preview in
the body isn't that.

- An **aim** button on the widget body (not buried in "more"). While it
  is on, the widget asks for frames back to back - the next request goes
  out as soon as the previous frame has fully arrived - at **160x120**,
  where a frame is about 1.5 KB and fits in the socket's send buffer, so
  it goes out without stalling. Target a few frames a second; measure.
- The preview is shown enlarged (a floating box like the Image widget's,
  or the body preview scaled up) - a 160x120 picture at widget-body size
  is too small to aim with.
- **Nothing goes out the outlet while aiming**, so ObjectRecog and
  whatever follows it aren't fed a stream of low-resolution frames.
- It **switches itself off** after a short time (say 30 s without the
  button being pressed again) and when the widget is disconnected,
  because while it runs the board is spending most of its time on the
  camera and other pins on that board will respond more slowly. The
  status line says so.
- Not available over a Monitor connection, same as the rest.

The 7 frames a second seen in the Step 0 live feed is not a guide to
this: that ran over the USB cable with NTK's firmware stopped. Over WiFi
with the firmware running, the rate is unknown until it's built.

### What travels on the wire

Not the image. Every model change is forwarded to the server over
socket.io for patch sync, and a 15-20 KB data URL per frame through
that path is waste.

Instead the server keeps the **latest frame per device in memory** and
serves it from a new route, `/deviceImage?key=<hardwareKey>&n=<frame
number>`, beside the existing `/localImage`. The outlet value is that
short URL; the frame number changes each frame, so downstream widgets
see a change and the browser doesn't serve a stale cached image. Only
the latest frame is kept (and perhaps the previous one, so a slow
consumer isn't handed a 404).

Side benefit: the same URL works as the source for an Image widget, if
Image later gets a source inlet.

## ObjectRecog changes

- New inlet `image`. `processFrame()` already accepts an `<img>` (the
  "test with an image file" path), so the recognition code itself does
  not change.
- When a value arrives on the inlet: load it into an `Image`, and on
  load run `processFrame(img)`. One frame in flight at a time; a frame
  that arrives while the previous one is still loading replaces the
  queued one rather than piling up.
- While the inlet is wired, **the webcam is not opened** (and is
  released if it was open). The camera checkbox then means "process
  incoming frames" rather than "camera on". The preview canvas in the
  "more" panel draws the incoming frame with the detection box, as it
  does for webcam frames.
- **Recording a slot needs rethinking at low frame rates.** A recording
  is a 5 s burst (`RECORD_BURST_MS`) needing at least 5 examples
  (`MIN_EXAMPLES_PER_RECORDING`); at 1 frame/s that is 5 examples with
  no margin. When the source is the inlet, record until a target number
  of examples (say 12) with a time cap, and show the count climbing.
  CameraIn could also be asked to run at its fastest rate for the
  duration of a recording.
- Match timing: `waitTimeFalse` defaults (1000 ms) assume 10 frames/s.
  With a frame every second a match would flicker off between frames.
  When fed from the inlet, hold a match for at least two frame
  intervals.

## Standalone / Monitor

- A pushed patch containing CameraIn cannot run standalone - recognition
  happens on the computer. Add it to the unsupported-widget list the
  push already reports, with a plain reason.
- Monitor mode has no camera path in v1. The widget shows "not
  available while monitoring".

## Order of work

1. ~~Step 0 test script on the board.~~ Done - see results above.
2. Firmware: a non-blocking outgoing queue for the client connection
   (the piece Step 0 showed is needed), then camera init (lazy, on first
   request) and the request/reply pair, in `firmware/common/` so both trees share it; on a board with
   no camera it answers with the "no camera" error. Build stamps.
3. Server: sysex handler and reassembly, in-memory latest frame,
   `/deviceImage` route, a socket message telling the client a new
   frame number is ready.
4. CameraIn widget, hardware path only, including aim mode. Verify end
   to end with the preview, and measure the aim-mode frame rate.
5. ObjectRecog `image` inlet, then the recording and match-timing
   adjustments.
6. No-hardware source option, "save image…", docs page
   (`docs/camerain.md`) and the ObjectRecog doc update.

Rough size: 2 is the bulk and the riskiest part (it touches how every
message leaves the board); 3-4 are straightforward; 5 is small apart
from the recording change; 6 is polish.

## Open questions

- **Name:** CameraIn (matches AnalogIn / SpeechIn / CloudIn) or
  something that says "device" so it isn't confused with the webcam
  widgets?
- **Other consumers:** should PoseRecog and FaceTrack get the same
  `image` inlet? The mechanism is identical; worth doing once
  ObjectRecog's is proven, not before.
- **Send to the LLM widget?** A frame URL on a wire makes "describe what
  the camera sees" a natural next step, but that needs image input in
  the LLM widget - separate plan.
- **Pico W:** no camera; the widget is XIAO ESP32-S3 Sense only and
  should say so when pointed at anything else.
