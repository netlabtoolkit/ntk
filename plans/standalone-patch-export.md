# Standalone patch export

**Status:** scoped via discussion. Not started.

Today, **all** patch logic runs on the host (NTK's own JS). The
CircuitPython firmware is a dumb Firmata relay with zero knowledge of the
actual patch graph, so closing NTK or disconnecting the device from the
host kills the patch entirely.

The goal: build a patch (e.g. AnalogIn → IfThen → Servo — real logic
widgets, not just I/O passthrough) and have it keep running autonomously
on the device once deployed, no host required.

## Grounding facts (verified against the codebase)

- A saved `.ntk` patch is already a clean, complete, serializable
  dataflow graph: `{widgets: [...], mappings: [...]}`. Each widget entry
  carries its `typeID` (`PatchLoader.js` reads `widgets[i].typeID` to
  know which view class to instantiate) plus its full configured model
  state. Each mapping is `{viewWID, modelWID, map: {sourceField,
  destinationField}}` — either widget-to-widget, or widget-to-hardware-pin
  (`modelWID` is a `deviceType:server:port` string like
  `network:192.168.4.1:3030`). This is already suitable as an
  interpreter's input with no reverse-engineering needed.
- Which widgets are theoretically portable to a microcontroller:
  - **Portable** (pure math / timers, no browser API): AnalogIn / Out,
    DigitalIn / Out, Servo, GroveSensor, IfThen, Boolean, Gate, Mix,
    Splitter, Process, Count, Pulse, Sequence, Tween, Data, and
    **Gesture** (its DTW matching is pure arithmetic once its input comes
    from a real wired pin instead of the in-widget dial).
  - **Never portable:** FaceTrack / PoseTrack (camera + MediaPipe WASM),
    SpeechIn / SpeechOut (browser Speech API),
    Audio / Video / Image / HTML / Text / Button / Keyboard / Knob
    (desktop-UI widgets — meaningless without the host's screen).
  - **Gray area, deferred:** CloudIn / CloudOut / OSCIn / OSCOut / Webhook
    — technically possible over the board's own WiFi (UDP / HTTPS) but
    real extra firmware work (TLS, etc.); not in v1 scope.
  - Any export / deploy step needs a compatibility check that clearly
    rejects a patch using an unsupported widget, not a silent failure.

## Recommended architecture: on-device generic interpreter (not codegen)

Two approaches were considered:

- **A. Generate CircuitPython source** ("compile the patch" into a
  literal `code.py`) — native speed, human-readable output, but real
  codegen engineering (one template per portable widget type) and every
  patch edit means regenerating + re-flashing.
- **B. Ship ONE generic on-device interpreter + a JSON patch file**
  (**recommended**) — firmware carries a single fixed runtime (effectively
  a MicroPython port of `SignalChainFunctions.js` + each portable
  widget's own state machine) that reads a patch description — close to
  the same file format NTK already saves — and evaluates it every loop
  tick. "Export" becomes "put this file on the device" instead of
  "regenerate and reflash." One implementation to maintain instead of a
  growing family of codegen templates; naturally incremental. Simpler
  than it sounds: the interpreter runs on the same board that would
  otherwise be "the hardware," so it skips the Firmata wire-protocol
  layer entirely for local pins.

The portable-widget scope must include **logic widgets** (IfThen, Mix,
etc.) from day one — the interpreter needs real branching / threshold /
timing state machines, not just scale / invert math. AnalogIn → Servo was
only ever a simplest-case illustration.

## Feedback / monitoring

Three options were discussed:

1. **Physical display (Grove LCD)** — firmware already supports this
   (`grove_lcd.py`, used today for the station-mode IP). Self-contained,
   no WiFi dependency once flashed, but ~2 lines of text and needs that
   specific hardware attached.
2. **A standalone WiFi status / logging HTTP endpoint** (e.g.
   `GET /status`) — useful but real new firmware surface; nothing in this
   firmware implements an HTTP server today (only the raw Firmata TCP
   socket), so it means pulling in `adafruit_httpserver` and building a
   status page from scratch. Most net-new work for the least reuse.
3. **Recommended: let NTK itself reconnect as a read-only monitor** — the
   device keeps reporting its live computed values over essentially the
   same reporting mechanism it uses today (Firmata analog / digital
   reporting, the Grove sysex reply), just without waiting for the host
   to tell it what to output — it's computing its own outputs via the
   interpreter but still broadcasting them. Point desktop NTK at the
   device's IP and you'd see the same patch in the same widget UI, just
   watching rather than driving. Almost no new protocol work (reuses the
   existing reporting mechanism *and* the entire existing widget-rendering
   UI as the dashboard). Blurs "standalone" and "host-driven" into one
   continuum rather than two hard-separated modes.

**Recommended combination:** option 3 as the primary feedback mechanism,
optionally paired with option 1 (a minimal LCD glance like "running / N
errors") for a true no-NTK-at-all status check. Option 2 deferred.

## Live push-to-device deploy (idea, not fully designed)

Rather than manually copying a patch file onto the device via Thonny /
USB, **NTK could push the current patch to the device over the same WiFi
connection already used for live Firmata control** — either automatically
on every change or via an explicit "Deploy" / "Sync to Device" action
(lean toward explicit, given how disruptive an unexpected mid-edit
redeploy could be to a running device). The device saves the received
patch JSON to its own filesystem (e.g. `standalone_patch.json`) for the
interpreter to pick up.

The same open connection carries patch-pushes one direction and live
status reports the other — the WiFi link becomes a combined
deploy + monitor channel.

**Open design questions:**

- Does the device run the interpreter loop **continuously** (redundant /
  duplicate execution while NTK is also driving the same live patch), or
  does the interpreter only take over once the host disconnects (an
  explicit handoff)? The latter avoids double-execution / conflicting
  output writes but needs clean "host present vs. absent" detection.
- Push-on-every-change vs. explicit deploy action.
- Where does `standalone_patch.json` live relative to the existing
  `settings.toml`-driven mode switch (SoftAP vs. station WiFi) — is "run
  the interpreter" a third independent mode flag, or does it layer on top
  of either WiFi mode?

See the CircuitPython firmware (`firmware/xiao-esp32c6-circuitpython-firmata/`,
`pins.py` / `firmata_server.py`) for the architecture this extends, and
[device-discovery.md](device-discovery.md) for the SoftAP-mode precedent.

## Folded in: replace Firmata with a native protocol

`firmata_server.py` implements the real Firmata wire protocol from
scratch in CircuitPython (~734 lines — message parsing, sysex framing,
capability / analog-mapping queries) solely so NTK's existing widgets,
written against `firmata-io` / johnny-five via `StandardFirmataModel.js`,
work unmodified over WiFi (`NetworkModel.js` just swaps the transport).
That reuse is the whole reason Firmata was the right choice for today's
dumb-relay firmware.

This standalone effort changes the calculus: once the device needs to
receive patch JSON, run its own logic, and report status / logging back —
none of which Firmata was designed to carry — it may make more sense to
design a single NTK-native protocol covering both real-time I/O *and*
patch-push / status / logging, rather than continuing to extend Firmata's
sysex mechanism (the way the GroveSensor sysex extension already had to,
fixed-point ceiling and all).

**Benefits of a native protocol:** far smaller / simpler device code;
Grove-style sensor readings become first-class instead of grafted onto
sysex; human-debuggable over WiFi (JSON / text) since bandwidth no longer
justifies Firmata's dense binary framing; escapes the awkward
`etherport-client`-pretending-to-be-a-serial-port hack in
`NetworkModel.js` (including its forced-forever-reconnect workaround); a
protocol designed with "device runs its own patch" in mind composes
better.

**Costs:** loses the "widgets work unmodified" reuse, unless the new
host-side model exposes the same JS interface `StandardFirmataModel.js`
does today (doable, real work); loses interop with stock Johnny-Five /
other Firmata tooling; it's a rewrite of firmware that's already working
and hardware-verified.

**Recommendation:** don't do this as a standalone refactor — fold it into
this standalone-patch-export effort. That's the point where the device
needs a richer NTK-native protocol anyway.

**Note:** the cost "USB / serial Arduino still needs real Firmata
regardless, so the host maintains two hardware-model implementations" may
not apply for long — build-order step 6 ("possible elimination of serial
and network Firmata support") would drop `ArduinoModel.js` /
`@serialport/bindings` entirely, leaving only one hardware-model
implementation. Marked "possible," not yet firm.
