# Standalone patch export

**Status:** scoped via discussion. Not started. Build-order step 5, but a
scoped v1 could lead instead — see [Sequencing: can this go
first?](#sequencing-can-this-go-first) below.

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
- Which widgets are theoretically portable to a microcontroller —
  **corrected 2026-09-17** while writing the compatibility checker
  (`app/scripts/utils/StandaloneCompatibility.js`), by checking every
  widget's actual `categories:` field in the codebase against this list
  rather than trusting the original scoping pass. Two corrections and
  two additions (widgets that didn't exist yet when this was first
  scoped):
  - **Portable** (pure math / timers, no browser API): AnalogIn / Out,
    DigitalIn / Out, Servo, GroveSensor, IfThen, Boolean, Gate, Mix,
    Splitter, Process, Count, **Concat**, Pulse, Sequence, Tween, Data.
    **Concat was missing from the original list** — it's pure
    string-join logic (`categories: ['logic']`), no browser API.
  - **Looks portable by category but isn't — excluded deliberately:
    Code.** Tagged `categories: ['logic']`, same as IfThen/Mix/etc., but
    it's arbitrary user-authored JavaScript (a CodeMirror editor, `eval`
    against inputs) — no CircuitPython interpreter can run that. This is
    exactly the kind of error a naive category-based classification
    would make, which is why the compatibility checker hardcodes the
    portable `typeID` list explicitly instead of deriving it from
    `categories:`.
  - **Deferred, not in v1 scope: Gesture.** Its DTW matching is pure
    arithmetic once its input comes from a real wired pin instead of the
    in-widget dial, so it's theoretically portable — but DTW is an
    O(n×m) computation run every loop tick, and CircuitPython on the
    XIAO ESP32-C6 is itself an interpreted language running on a single
    RISC-V core, so per-tick cost is a real open question. Decided
    (2026-09-17) to leave it out of v1 and revisit later rather than
    spend a spike on it now. (Update: a real-hardware spike since then
    resolved the *non-Gesture* set's performance risk — see
    [Sequencing](#sequencing-can-this-go-first) below — but Gesture
    itself is still deferred out of scope, not re-evaluated.)
  - **Never portable:** FaceTrack / PoseRecog (camera + MediaPipe WASM),
    SpeechIn / SpeechOut (browser Speech API),
    Audio / Video / Image / HTML / Text / Button / Keyboard / Knob
    (desktop-UI widgets — meaningless without the host's screen), and
    **ObjectRecog** (camera + local ML embedder, same as FaceTrack/
    PoseRecog — didn't exist when this was first scoped). **Blank** is
    a visual-only no-op (canvas spacer) — not meaningfully portable or
    unportable, just irrelevant on-device.
  - **Gray area, deferred:** CloudIn / CloudOut / OSCIn / OSCOut / Webhook
    — technically possible over the board's own WiFi (UDP / HTTPS) but
    real extra firmware work (TLS, etc.); not in v1 scope. **LLM**
    (didn't exist when this was first scoped) belongs in this same
    bucket, not "never portable" — its Anthropic/Ollama API call is a
    network request the board's own WiFi could technically carry, same
    category of future work as Webhook/CloudOut, just deferred.
  - Any export / deploy step needs a compatibility check that clearly
    rejects a patch using an unsupported widget, not a silent failure -
    **built 2026-09-17**, see [Compatibility checker](#compatibility-checker-built-2026-09-17) below.

## Compatibility checker (built 2026-09-17)

`app/scripts/utils/StandaloneCompatibility.js` — a plain AMD module (same
convention as `SignalChainFunctions.js`), no UI wiring yet. Exports
`PORTABLE_TYPE_IDS` (the hardcoded list above, not derived from
`categories:`) and `checkPatch(patch)`, which takes the same
`{widgets, mappings}` shape `Patcher#exportPatch`/`PatchLoader#loadJSON`
already use and returns `{compatible: boolean, unsupportedWidgets:
[{wid, typeID, title}]}` — naming exactly which widgets are the problem,
not just pass/fail.

Verified against representative patches (all-portable, empty, and a
mixed patch with FaceTrack/SpeechOut/Code/Gesture mixed into an
otherwise-portable set) under a minimal Node/AMD shim — all passing. Not
yet wired to any UI (no "Export standalone patch" action calls it yet);
that's the natural next step once this checker itself is in place.

## Recommended architecture: on-device generic interpreter (not codegen)

Two approaches were considered:

- **A. Generate CircuitPython source** ("compile the patch" into a
  literal `code.py`) — native speed, human-readable output, but real
  codegen engineering (one template per portable widget type) and every
  patch edit means regenerating + re-flashing.
- **B. Ship ONE generic on-device interpreter + a JSON patch file**
  (**recommended**) — firmware carries a single fixed runtime (effectively
  a CircuitPython port of `SignalChainFunctions.js` + each portable
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
only ever a simplest-case illustration. Gesture is deferred out of this
scope for now (see above) — it's the one portable widget with a real
open performance question, and revisiting it later avoids blocking v1 on
an unresolved spike.

## Feedback / monitoring

Three options were discussed:

1. **Physical display** — firmware already supports a Grove LCD
   (`grove_lcd.py`, used today for the station-mode IP), though the
   user's actual hardware for this project is a different OLED display,
   not that RGB LCD — a physical-display option here would target the
   OLED, with new device-side driver code, not reuse `grove_lcd.py`.
   Self-contained, no WiFi dependency once flashed, but limited display
   real estate and needs that specific hardware attached.
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

**Decided (2026-09-17): option 3 only for v1.** Reconnect-as-monitor is
the sole feedback mechanism; the physical-display glance (option 1) is
not being added — it needs specific hardware attached and isn't
required. Option 2 deferred indefinitely.

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

**Decided (2026-09-17):**

- **Explicit handoff.** The interpreter stays idle while NTK is
  connected and driving; it only takes over outputs once the Firmata
  connection drops. Avoids double-execution / conflicting output writes.
  Needs clean "host present vs. absent" detection (a Firmata disconnect
  event).
- **Explicit "Deploy" action**, not push-on-every-change — safer than an
  unexpected mid-edit redeploy disrupting a running device.
- **Auto-detect from patch-file presence**, not a separate
  `settings.toml` flag or a fold-in to the existing SoftAP/station mode
  enum. If a valid `standalone_patch.json` exists on the device
  filesystem, it's ready to run standalone — no new settings surface
  needed. Independent of whichever WiFi mode (SoftAP/station) is active.

See the CircuitPython firmware (`firmware/xiao-esp32c6-circuitpython-firmata/`,
`pins.py` / `firmata_server.py`) for the architecture this extends, and
[device-discovery.md](device-discovery.md) for the SoftAP-mode precedent.

## Sequencing: can this go first?

The [README build order](README.md#proposed-build-order) puts this at
step 5, after the loopback-server removal and wiring rebuild (steps 1–2).
**A scoped v1 could lead instead** — its core has no dependency on those
steps. What's independent:

- **The on-device interpreter.** `SignalChainFunctions.js` (in
  `app/scripts/utils/`) and each widget's logic (`app/scripts/views/*/`)
  are renderer-side and stable — untouched by socket.io removal. The
  interpreter itself is a separate CircuitPython artifact running on the
  device.
- **The compatibility checker** (see [Grounding facts](#grounding-facts-verified-against-the-codebase))
  — pure renderer JS walking the patch graph via `Patcher.js`.
- **The `.ntk` patch format** as the interpreter's input — already a
  clean serialized graph, no format change needed.
- **Reconnect-as-monitor feedback** (option 3 above) — reuses the
  *existing* Firmata analog/digital reporting mechanism and the existing
  widget UI as a read-only dashboard. `NetworkModel.js` pointed at a
  device IP already works today; that's how live WiFi Firmata control
  works now.

**The one real entanglement is the native-protocol fold-in** (next
section). That rewrite lands in `server/modules/nlHardware/NetworkModel.js`
(and possibly `StandardFirmataModel.js`) — main-process code, exactly
what build-order step 2 relocates across the new Electron IPC boundary.
Build the native protocol's host endpoint before steps 1–2 and step 2
has to carry it over later — rework in the one place the plan says to
touch last. It also pulls against the recommended monitoring approach:
option 3 is attractive *because* it reuses Firmata's reporting; a native
protocol replaces that mechanism, so monitoring would be rebuilt on the
new protocol instead. And whether the host ends up with one hardware
model or two depends on build-order step 6 (possibly dropping serial
Arduino), which isn't a firm decision.

**Secondary risks of going first:**

- **Interpreter performance — RESOLVED (2026-09-17), no longer a risk
  for the non-Gesture set.** Spiked on real hardware (XIAO ESP32-C6,
  CircuitPython 10.3.0): a representative 20-widget patch (17 eval
  steps covering the full non-Gesture portable set — Process, IfThen,
  Boolean, Gate, Mix, Splitter, Count, Pulse, Sequence, Tween, Data,
  Servo) evaluates a full tick in ~1.78ms (~561Hz). Extrapolated to a
  much larger 100-widget patch (~0.1ms/widget): still ~10.5ms (~95Hz) —
  comfortably above the standard 50Hz servo-loop rate and any realistic
  GPIO/sensor polling need. Real hardware I/O costs, measured
  separately (Turbo wouldn't help these): `analogio.AnalogIn.value`
  ~205μs/read, `digitalio` ~10μs/read. **CircuitPython Turbo isn't
  needed for v1** — there's generous headroom without it. It only
  becomes relevant if a future compute-heavy widget (Gesture's DTW) is
  added back in; RISC-V/ESP32-C6 support for Turbo itself is still
  unconfirmed (Adafruit's docs only show RP2040/ARM examples) and
  wasn't resolved on this pass — revisit if/when Gesture is reconsidered.
- **No leverage for the rest of the roadmap** — unlike steps 1–2,
  standalone export doesn't unlock Macro / multi-select / the iPad port.
  The native protocol would help the iPad bridge slightly; nothing else.

**Recommended first slice:** interpreter (with logic widgets — IfThen,
Mix, Gate, etc. — from day one, not just AnalogIn → Servo) +
compatibility checker + **manual patch-file copy** (Thonny / USB) +
monitor over the existing Firmata reporting. **Keep Firmata as the
transport; defer the native-protocol fold-in.** That version touches only
device firmware plus stable renderer code, and de-risks the interpreter
concept before any host rework. Add the WiFi deploy channel (see [Live
push-to-device deploy](#live-push-to-device-deploy-idea-not-fully-designed))
and the native-protocol rewrite once steps 1–2 have settled where the
host hardware code lives.

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
needs a richer NTK-native protocol anyway. **But if standalone export
runs ahead of build-order steps 1–2, defer this fold-in specifically**
(see [Sequencing](#sequencing-can-this-go-first)) — its host side lives
in the exact `server/` hardware code those steps relocate, so building it
early means building it twice.

**Note:** the cost "USB / serial Arduino still needs real Firmata
regardless, so the host maintains two hardware-model implementations" may
not apply for long — build-order step 6 ("possible elimination of serial
and network Firmata support") would drop `ArduinoModel.js` /
`@serialport/bindings` entirely, leaving only one hardware-model
implementation. Marked "possible," not yet firm.
