# DCC widgets (WiThrottle, then DCC-EX)

**Status:** plan only (2026-10-19, updated 2026-10-28). No DCC widget
built yet; the Encoder widget it needs is done (2026-10-27). Decisions
from Phil are in "Decided" below.

Control a model railway's command station from NTK: track power, loco
speed and direction, turnouts (points), and - on DCC-EX - the
programming track. Built like AnalogOut - a value comes in an inlet,
the widget turns it into a command - but talking a railway protocol
instead of Firmata.

**Every board runs standalone.** The XIAO boards around the layout - a
handheld throttle, servo controllers under the baseboard, animation
controllers - each run their own patch and talk to the command station
themselves, with no computer running (see
[standalone patch export](standalone-patch-export.md)). NTK on the
computer is where a patch is built and tried out, live, before it's
deployed to its board.

## Two ways the same patch runs

- **Live, while building it:** NTK runs the patch. The board is NTK's
  I/O (Firmata, as today), and NTK itself talks to the command station.
  This is where the widget UI, the simulated station and debugging are.
- **Standalone, once deployed:** the board's interpreter runs the same
  patch, and the board talks to the command station directly.

So every DCC widget that goes on a board is built twice: in NTK's JS
(widget + server connection) and in the board's interpreter
(`firmware/common/standalone_interpreter.py`), and the two must behave
the same. That's already the pattern for every portable widget; the
new part is that the board needs its own WiThrottle client. CloudIn /
CloudOut (MQTT from the board) are the precedent for a board talking to
a network service itself.

## Two protocols, WiThrottle first

- **WiThrottle** (JMRI's throttle protocol, what Engine Driver and the
  WiThrottle app speak) covers driving: power, locos, turnouts, with
  every change announced to every client. DCC-EX speaks it natively on
  its usual port 2560, and so does JMRI (port 12090 by default) - which
  in turn talks to nearly any system (Digitrax, NCE, Lenz, ...). Short
  text lines at a low rate, so small enough for a CircuitPython client
  on the board.
- **DCC-EX native** (`<...>` commands) is only needed for the
  programming track (reading / writing CVs), which WiThrottle doesn't
  have. Programming is done at the computer, so this only exists in NTK,
  never on a board.

## The widgets

DCC commands don't share a shape - speed is a continuous value for one
loco, a turnout is an on/off for one id, power is global, and the
programming track is a request that comes back with an answer. One
widget with a "command type" dropdown would be several widgets in one
box. So: **a small family of widgets sharing one connection** per
station (per NTK, and per board), the way CloudIn and CloudOut share
one broker connection.

| Widget | Protocol | On a board | Job | Main body | Inlets | Outlets |
|---|---|---|---|---|---|---|
| **DCC Station** | WiThrottle | yes | Track power, emergency stop, connection status | Power on/off button, E-stop button, connected / power status | `power` (on when > 0.5), `stop` (rising edge = E-stop) | `power` (1/0), `connected` (1/0) |
| **DCC Throttle** | WiThrottle | yes | One loco: speed, direction, a few functions | Speed dial (like AnalogOut's), direction toggle, stop button | `speed` (0-126), `step` (+/- change, for an encoder), `direction` (fwd when > 0.5), `address` (switch loco), `fn1`-`fn4` | `speed`, `direction`, `address`, `fn1`-`fn4` (as the station reports them, so another throttle's changes show up) |
| **DCC Turnout** | WiThrottle | yes | One turnout: throw / close, or follow it | Big toggle showing thrown / closed | `in` (thrown when > 0.5) | `state` (1 thrown / 0 closed, as reported), `value` (the "closed" or "thrown" value, e.g. a servo angle) |
| **DCC Program** | DCC-EX | no | Programming track: read / write CVs and loco address | Read and Write buttons, CV and value fields, result readout | `read` (rising edge), `write` (rising edge), `cv`, `value` | `result` (value read, or -1 on failure), `done` (pulse) |
| **DCC Route** | WiThrottle | yes | Set an EX-RAIL / JMRI route (e.g. "yard ladder") | Set button, route name, status | `in` (rising edge = set) | `state` (1 when set / active, as reported) |
| **Encoder** (built 2026-10-27, `step` outlet added 2026-10-29; general NTK input) | - | yes | A rotary encoder on two board pins | Dial showing the count, draggable to simulate turning | `set` (built: becomes the current count) | `out` (built: running count within min / max, optional wrap), `step` (+/- the step size per click, for DCC Throttle's `step`) |
| **Scene** (new, general NTK, not DCC-only) | - | yes | Plays a timed story - steps, waits, ramps - across several outputs | Play / stop, current step, progress | see [Scene widget](#scene-widget-draft-needs-refinement) | see there |

"More" panels hold the settings: the station's address (see Network),
and per widget the loco address (Throttle), which
function numbers `fn1`-`fn4` drive and whether each follows its inlet
or toggles on each press (Throttle, default F0 headlight, F1, F2, F3,
following), the turnout and its closed / thrown values (Turnout),
pins A / B and limits (Encoder), program-on-main mode (Program).

## Turnout terms

The widget, its outlets and its docs use the station's own words:

- **Closed** - set for the straight-through, main route ("normal").
  `state` 0. WiThrottle state 2, DCC-EX `<T id 0>` / `C`.
- **Thrown** - set for the diverging route, the branch ("reverse").
  `state` 1. WiThrottle state 4, DCC-EX `<T id 1>` / `T`.
- **Unknown** - the station doesn't know yet (e.g. just powered up,
  never set). WiThrottle state 1. The widget shows it greyed out, and
  `state` / `value` send nothing until a real state arrives.

**"Open" isn't used.** It's not a state in DCC-EX, JMRI or WiThrottle,
and people use it for different things (some mean thrown, some the
point blade that's away from the stock rail - and on every turnout one
blade is open whichever way it's set). The docs say so, so nobody wires
"open" assuming it means one or the other.

Closed = straight is a convention, not something the station checks:
it only knows the state name, and a turnout wired or mounted the other
way round goes to the branch on "closed". For a turnout a board drives,
fix that by swapping the closed and thrown values in the more panel; on
a hardware turnout, in the station's turnout definition. A curved or
wye turnout has no straight route - closed is just whichever route the
station calls closed.

## Virtual turnouts

A virtual turnout is a turnout the station lists but drives nothing
for. On DCC-EX it's one line in EX-RAIL's `myAutomation.h`:

    VIRTUAL_TURNOUT(12, "Yard entry")

(JMRI: an internal turnout, `IT...`.) From then on it behaves like any
other turnout: it's in every throttle's list, anyone can throw / close
it, and the station keeps its state and announces every change. Two
uses, both central to this plan:

- **A board moves the points** (use case 2): a XIAO's DCC Turnout
  follows it and drives a servo. The station's state is the one truth;
  a rebooted board reconnects, reads it and catches up.
- **A shared on/off flag** (use case 3): it moves nothing, it's a
  signal between boards, phones and EX-RAIL - e.g. board A's detector
  throws "50 - Crossing trigger" and the crossing board starts its
  scene. No board-to-board wiring or protocol.

This is what replaces DCC accessory decoders in this plan (see Later):
NTK boards following virtual turnouts do the same job, plus slow
servo motion, frog relays and testing in NTK without a layout.

## Use cases

### 1. Handheld throttle: a XIAO with a rotary encoder and buttons

A battery-powered box: encoder for speed, a stop button,
a direction switch, a few function buttons, optionally the OLED.

    Encoder --step--> DCC Throttle <--direction-- DigitalIn (switch)
    DigitalIn (stop button) --stop--> DCC Throttle
    DigitalIn (buttons) --fn1..fn4--> DCC Throttle
    DCC Throttle --speed / address--> Display (OLED)

- **Stop is its own button**, not a press on the encoder: a stop should
  be the most obvious control on the box, not a variant of the speed
  knob, and a bumped encoder press can't stop a train by accident.
- **Encoder, not a pot:** an encoder only says "a bit faster / slower",
  so the Throttle's `step` inlet changes the loco's *current* speed -
  including a speed someone else set from a phone. No jump when another
  throttle has changed it, which a pot would cause. Each click moves
  the speed by the Encoder's own `step` setting (e.g. 2 of 126). At 0
  it stops; it doesn't
  go through zero into reverse (possible later option).
- **Fractional steps for fine control:** the Throttle keeps its speed
  as a decimal and sends it rounded (DCC and WiThrottle only take
  whole steps, 0-126), so an Encoder `step` of 0.5 takes two clicks per
  speed step - finer feel for slow shunting - and 1.5 alternates one
  and two. See "Fractional speed" below.
- **Functions:** a button held down is right for a horn ("follow"), a
  headlight wants "toggle on press" - per function, in the more panel,
  so no Count / Boolean per button.
- **Picking the loco:** the `address` inlet switches locos - the old
  one is stopped and released first. E.g. a few buttons each sending a
  fixed address through Data, or the encoder in a "select" mode built
  with Gate. `address` outlet so the OLED can show it.
- **The OLED** (Display widget, already portable) shows address and
  speed - a handheld with no display is hard to use.

### 2. Servo controller: a XIAO driving turnout servos

One XIAO under the baseboard following several turnouts and moving
their points - for turnouts defined on the station with no hardware of
their own: DCC-EX's `VIRTUAL_TURNOUT(id, "description")` in
`myAutomation.h` (EX-RAIL), or an internal turnout (`IT...`) in JMRI.
They're in every throttle's turnout list and can be thrown from
anywhere - Engine Driver, a physical throttle, an EX-RAIL route, a
handheld - and the board moves the points:

    DCC Turnout (12 - Yard entry) --value--> Tween --> Servo (pin 9)
    DCC Turnout (12 - Yard entry) --state--> DigitalOut (frog relay)

- `value` sends the "closed" or "thrown" number from the more panel
  (defaults 80 / 100, a small swing - set per turnout to match the
  points). The Tween gives slow, prototypical movement instead of a
  snap. A frog-polarity relay is a DigitalOut from `state`.
- The station's state is the one truth: the board only ever moves the
  points to what the station says, whoever threw it, so the points never
  disagree with what every throttle shows.
- **At power-up** the board joins WiFi, connects to the station, gets
  every turnout's state and moves the servos there. Until then the servo
  pins are idle. Proposed: remember each turnout's last state on the
  board so servos don't twitch at boot if nothing changed.
- If the station or WiFi is down, the points stay where they are and
  catch up when the board reconnects.
- **Patch size:** 15 turnouts is 15 Turnout + 15 Servo (+ Tweens). A
  later "DCC Turnout bank" could follow several at once. Not in this
  plan. Servos need their own 5 V supply, not the XIAO's (docs).

### 3. Animation controllers: a XIAO per animation

A level crossing, workers building something, a windmill, building
lights - each on its own XIAO near the scene, playing out a little
story with motion. Simple ones use Sequence, Tween, Pulse, NeoPixel,
Servo and DigitalOut (all already run on the board); a real story with
several steps and waits is what the new **Scene** widget is for (see
[below](#scene-widget-draft-needs-refinement)). Sound doesn't run on
the board - there's no audio (a serial MP3 module is in Later).

Two example stories:

- **Road crossing** (triggered): train detected -> lights flash and
  bell -> after 3 s the gates come down slowly -> wait until the train
  has cleared (second detector, or a timeout) -> gates up -> lights
  off.
- **Workers building** (looping, ambient): a crane swings, pauses a
  random 2-6 s, a welder's light flickers, a worker figure nods - with
  random variation so it doesn't look like a loop.

**Triggers:**
- **A detector on the board itself** (IR, reed switch, Grove sensor) -
  plain NTK, no DCC at all.
- **A turnout's state** - DCC Turnout's `state`.
- **Virtual turnouts as on/off signals between everything.** A virtual
  turnout doesn't have to move anything - it's a shared on/off flag on
  the station that every client sees. EX-RAIL's `THROW(id)` /
  `CLOSE(id)`, a phone, or **another board** sets it (DCC Turnout's
  `in`), and a board following it starts its animation. So board A's
  detector can start board B's crossing through the station, with no
  board-to-board wiring or protocol. This covers most of what DCC Sensor
  would have been for. The docs get an example.
- **A loco's speed or function** - only for a loco the board has
  acquired, and acquiring one someone else is driving may take it over.
  A "watch only" option, if WiThrottle allows it - to check.

### 4. Master control with a touch screen (wildcard)

Not planned for now. Noted so the DCC widgets' main-body controls work
by touch (tap targets, nothing hover-only) in case a touch "run view"
of NTK, or the [iPadOS port](ipados-port.md), comes later. Existing
apps (Engine Driver, JMRI panels, DCC-EX's web throttle) can fill the
role meanwhile, since the station takes several clients.

## Scene widget (draft, needs refinement)

**Superseded by [its own plan](scene-widget.md)** (2026-10-30); the
draft below is kept for the record.

A general NTK widget, not DCC-specific: a list of timed steps that
plays out a story across several outputs. Today a multi-step story is
a tangle of Pulse, Gate, IfThen and Sequence (which only has 4 ramps);
Scene makes it one readable list. First sketch, to refine with Phil:

- **Steps** (more panel, a list): set an outlet to a value; ramp an
  outlet to a value over a time (like Tween); wait a time; wait a
  random time (min-max); wait for an inlet (with an optional timeout);
  jump / loop.
- **Outlets:** several (4-6?) generic `out1`... wired to Servo,
  NeoPixel, DigitalOut, Display, DCC Turnout's `in`, etc.
- **Inlets:** `start` (rising edge), `stop`, and `in1`/`in2` for the
  "wait for" steps (e.g. the crossing's "train cleared" detector).
- **Options:** loop; what `stop` does (freeze vs return to the
  starting values - the crossing's gates must go back up).
- **Main body:** play / stop button (testable with no sensors
  attached - CLAUDE.md principle), current step name, a progress bar,
  flashing while it's waiting so a stalled "wait for" is visible.
- **Runs standalone** - a Scene step in the interpreter, added to both
  portable lists; must never block the tick loop (all timing by
  `monotonic` checks, like Pulse / Tween).

To refine: how steps are edited in a 94px-wide widget (a more-panel
list editor vs a text format like `3s out2 ramp 90 2s`); how many
outlets; whether parallel tracks (two things moving at once) are steps
with "don't wait" or separate lanes.

EX-RAIL can also run sequences on the station itself; Scene is for
scenes driven by a board next to them, built and tested in NTK.

## Rotary encoder

**Built 2026-10-27** (live, standalone and Monitor, hardware-verified
on a XIAO ESP32-S3; see `docs/encoder.md`). What was built differs
from the original plan below: one `out` outlet (the running count,
within min / max, optional wrap) and a `set` inlet (whatever arrives
becomes the count) - no per-click `step` outlet.

**`step` outlet - built 2026-10-29** (NTK widget, interpreter, docs;
not yet hardware-tested or committed). Model field `delta` (the
widget's `step` field is already the step size). Each turn sends
clicks x step, `rev` applied, held for 200 ms (visible on a Text
widget), then 0 for at least one frame (live) / tick (board) before
the next turn, so two equal clicks in a row are two changes to a
receiver; turning during the hold is added up and sent together. Not limited by min / max / wrap; `set` sends nothing;
dragging the dial sends how far it moved, the mouse wheel one click.
`out` and `set` are unchanged, so an ordinary knob (volume, a menu, a
brightness) is unaffected. **Consequence for DCC Throttle:** its
`step` inlet just adds whatever non-zero value arrives (and ignores
the 0s); the size of a click is the Encoder's `step` setting, so
Throttle needs no step-size field of its own.

**Why `step` and not a loop through `set`** (the handheld's speed):
DCC Throttle owns the loco's speed. The station reports every change
to an acquired loco, whoever made it (a phone, Engine Driver,
EX-RAIL), through the WiThrottle connection to the Throttle widget, so
the Throttle always knows the real speed and each click adds to that.
The alternative - `Throttle speed -> Encoder set`, `Encoder out ->
Throttle speed` - was rejected: with network lag the station's echo of
an earlier speed (52) can arrive after a quick turn (to 54) and pull
the encoder back, so the two fight; and it's a cycle in the patch,
which the interpreter's evaluation ordering treats as a mistake. Still
possible to wire, not recommended or documented for this.

Original plan, kept for reference:

A new general NTK input widget (useful well beyond trains), needed for
use case 1:

- **On the board:** CircuitPython's `rotaryio.IncrementalEncoder` on
  two pins counts in hardware, so fast turns aren't missed by the tick
  loop. **Check that `rotaryio` is in the XIAO ESP32-C6 build** (the
  ESP32 port has it; the C6 needs confirming).
- **Live:** the firmware reports the count to NTK through a sysex
  message, the way GroveSensor readings already work (Firmata has no
  standard encoder message NTK uses).
- **Outlets:** `position` (running count, optionally clamped to a
  min / max - then it works as a menu or a volume) and `step` (+1 / -1
  per click - what DCC Throttle's `step` takes).
- **Testing without hardware:** the main-body dial can be dragged to
  send steps, like Knob's.
- No push button needed. Seeed's Grove Encoder and Mouse Encoder have
  none anyway; a separate stop button is clearer (see use case 1). If an
  encoder with a button is used, the button is just a DigitalIn on its
  own pin.

## WiThrottle protocol

Line-based text over TCP, each message ending in a newline. From JMRI's
"WiThrottle protocol" page. **Check each message against a real DCC-EX
station before building** - DCC-EX's own WiThrottle server is a
reimplementation and may differ from JMRI in the details.

- **Session:** client sends `N<name>` (e.g. `NNTK handheld`) and
  `HU<unique id>` (the board's MAC). The server answers with its
  version (`VN2.0`), roster (`RL...`), power state (`PPA0` / `PPA1` /
  `PPA2` unknown), turnout list (`PTL`) and heartbeat interval (`*10` =
  seconds).
- **Heartbeat:** client sends `*` at least once per interval (every
  half interval); `*+` turns monitoring on. If the heartbeat stops,
  the server stops that client's locos - the safety net for a handheld
  whose battery dies or walks out of WiFi range.
- **Power:** `PPA1` on / `PPA0` off, from either side.
- **Turnouts:** list `PTL]\[<system name>}|{<user name>}|{<state>...`,
  state 1 unknown, 2 closed, 4 thrown. Client sends `PTAC<name>` close,
  `PTAT<name>` throw. Every change, from any client, comes back as
  `PTA2<name>` / `PTA4<name>`.
- **Locos** (multi-throttle commands, `M` + throttle id + action):
  - Acquire: `MT+S3<;>S3` (S short address, L long - L above 127).
    The server answers with the function labels and current state:
    `MTAS3<;>V0`, `MTAS3<;>R1`, `MTAS3<;>F00` ...
  - Speed `MTAS3<;>V50` (0-126), E-stop `MTAS3<;>X`, direction
    `MTAS3<;>R1` forward / `R0` reverse.
  - Functions: `MTAS3<;>f13` sets F3 on, `f03` off (the "force" form -
    sets the state directly instead of a button press / release).
  - Release `MT-S3<;>r`. `MTA*<;>X` E-stops every loco this client has.
  - Changes to an acquired loco come back as `MTA...` lines, so another
    throttle driving the same loco shows up.
- **Routes** (for DCC Route): list `PRL...`, set with `PRA2<name>`,
  state changes announced like turnouts. **Check whether and how DCC-EX
  sends EX-RAIL `ROUTE`s / `AUTOMATION`s here** - from memory, to
  verify.
- **Quit:** `Q`.

## DCC-EX native protocol (DCC Program only, NTK only)

From the DCC-EX command reference (dcc-ex.com, "Command Summary"),
checked 2026-10-19. Every command and reply is `<...>`.

- **Programming track:** `<R cv>` -> `<v cv value>` (-1 on failure);
  `<R>` reads the loco address -> `<r address>`; `<W cv value>` writes a
  CV; `<W address>` writes the loco address. **Check the exact write
  replies against the station's firmware version before building** -
  they changed between versions.
- **Program on main (POM):** `<w cab cv value>` / `<b cab cv bit value>`
  - no reply, so nothing to confirm it worked.
- **Power for the programming track:** `<1 PROG>` / `<0 PROG>`.
- **Status:** `<s>` -> `<iDCCEX version / ...>` - confirms the address
  really is a DCC-EX station before offering Program.

## Connection

### In NTK (live)

New server models in `server/modules/nlHardware/`, registered in
`Hardware.js`'s modelMap and keyed by host and port, so every widget
pointed at the same station shares one connection (as
`Cloud:host:port` does):

- **`WiThrottleModel.js`** (`WiThrottle:host:port`): opens the session,
  keeps the heartbeat, acquires each Throttle's loco, keeps the latest
  power / turnout / loco state and hands it to the widgets.
- **`DCCEXModel.js`** (`DCCEX:host:port`): a second socket to the same
  station for DCC Program.

Both rate-limit throttle commands (per loco at most every ~100 ms,
always the latest value, nothing sent for an unchanged speed - same
pattern as CloudModel's send interval), reconnect on drop, and report
failures through the existing `connectionFailed` / `connectionLost` /
status path.

### On the board (standalone)

A WiThrottle client in `firmware/common/` used by the interpreter's
DCC steps - one connection per station, shared by the patch's DCC
widgets. What's different from NTK's:

- **Never block the tick loop.** Non-blocking socket reads, a short
  connect timeout, and reconnect attempts spaced out (e.g. every 5 s)
  so an unreachable station doesn't stall the rest of the patch - or
  trip the firmware's watchdog. **Unlike Cloud's v1, it keeps
  reconnecting while ticking:** stations get power-cycled with the
  layout, and a servo board that gave up after one try would be
  useless.
- **Memory:** the `PTL` turnout list and the roster can be long. Parse
  line by line as they arrive and keep only the turnouts and locos the
  patch uses.
- **Message handling separate from the socket**, as plain functions
  (line in -> state changes / lines out), so it's unit-tested under
  CPython against a fake station like the interpreter's other steps -
  and so the JS and Python sides can be checked against the same
  test transcripts.
- **Handoff:** when NTK connects to the board (explicit handoff, see
  the standalone plan), the board stops its locos, releases them and
  closes its WiThrottle session before releasing its pins; NTK then
  drives live with its own session. When NTK disconnects, the board
  reconnects to the station and picks up from the station's current
  state. A turnout board just closes and reopens its session - the
  points don't move unless the state changed.
- The OLED's status line could show the station connection ("DCC ok" /
  "no DCC") - small, helps when a board doesn't respond.

### Network

- **The station should be on the home network** (station / client
  WiFi mode), not running its own access point: every board, phone and
  the computer join one network, and an ESP32 access point only takes a
  few clients.
- **Use the station's IP address** in the widgets, with a fixed IP or
  a DHCP reservation in the router. Whether the boards can resolve a
  `.local` name isn't known - to check, not to rely on.
- **Client count:** each standalone board is its own client of the
  station, plus phones and NTK. **How many WiThrottle clients DCC-EX
  accepts at once needs checking first** - with a handheld, a few servo
  boards and several animation boards it could be ten or more. If the
  limit is low, that changes the plan (e.g. boards that only follow
  turnouts share through one "bridge" board, or the station runs on
  JMRI). This is phase 0.
- The station's address is a field on each DCC widget, saved with the
  patch, so it goes to the board with it. Possibly a shared default in
  the Settings drawer later. Default `192.168.4.1:2560` only matters
  for a first try with the station in its own access-point mode.

### Status updates

The station announces changes to every connected client, whoever made
them - a phone, a physical throttle, an EX-RAIL automation, another
board. Each widget shows its part, in NTK and on a board alike:

- **Power** (`PPA`): Station's power button and `power` outlet.
- **Locos** (`MTA...V / R / F` for acquired locos): Throttle's dial,
  direction toggle and outlets.
- **Turnouts** (`PTA`): Turnout's toggle and `state` / `value`
  outlets.
- **Connection** (socket up / down): Station's `connected` outlet and
  every DCC widget's status text.

Everything arrives in the session's opening messages too, so widgets
start out right instead of waiting for the next change.

**A remote change vs a wired inlet:** if another throttle changes a
loco's speed, the dial and outlets follow it. The `step` inlet works
from that new speed. A wired `speed` inlet wins again on its next
value. Changes the widget made itself come back too; they only update
the display, never get sent again.

**Fractional speed (decided 2026-10-29).** DCC itself has only whole
speed steps (DCC-EX `<t>` 0-127 with 1 = E-stop, WiThrottle `V`
0-126; decoders' own 28/14-step modes are coarser still), so the
station never sees a decimal. DCC Throttle keeps the speed it is
heading for as a decimal, `speedExact`, and sends `round(speedExact)`:
- `step` adds to `speedExact`, then clamps it to 0-126.
- Only a change in the *rounded* value is sent - a 0.5 click that
  doesn't cross a whole step sends nothing (and nothing to rate-limit).
- A remote change (another throttle) or a wired `speed` value sets
  `speedExact` to that value outright, dropping any fraction, so the
  next click starts from where the loco really is. The widget's own
  echo doesn't reset it (it only updates the display, as above), or a
  0.5 click would be lost on every round trip.
- The dial and `speed` outlet show the rounded speed, the one the loco
  is actually running at.
- A wired `speed` inlet is rounded the same way (AnalogOut-style
  rescaling often gives decimals).
Tested 2026-10-29 with the Encoder alone: `step` 1.5 counts as
expected; the Throttle side is still to build.

## Safety

A train keeps running at its last speed when its throttle stops
talking.

- The WiThrottle heartbeat is the main net: a board that crashes, loses
  power or leaves WiFi stops sending it, and the station stops its
  locos.
- DCC Throttle stops and releases the loco when it's switched off,
  deleted, switches `address`, or at handoff.
- E-stop (Station's button / `stop` inlet) sends `MTA*<;>X` - every
  loco this NTK or board is driving. It doesn't reach locos driven only
  by other throttles; that's what the station's power off is for, and
  the more panel says so.
- An "E-stop on disconnect" option (default on) on DCC Station: if NTK
  quits or the patch is closed, E-stop first.
- The E-stop button is always in Station's and Throttle's main bodies,
  never only in a "more" panel.
- DCC Program's Write needs the widget's own button or a rising edge on
  `write` - no writing on every value change, since writing the wrong CV
  (e.g. CV 1, the address, or CV 8 = reset) can make a loco
  unresponsive. Writes stay off the main track unless the program-on-main
  option is turned on, and the more panel says that POM gives no
  confirmation.

## Testing without hardware (CLAUDE.md principle)

- **A simulated station in NTK**, picked with the address `simulated`:
  keeps power, loco speeds, a few turnouts (including "virtual" ones)
  and a small CV table in memory, and answers like a real one,
  including announcing changes. A whole patch - an Encoder into DCC
  Throttle, a DCC Turnout driving a Servo - can be built and checked
  before a layout is connected.
- Proposed: **the simulator also listens on a TCP port**, so a real
  board running its deployed patch can be pointed at the computer's IP
  and tested against it - the full standalone path, without a station.
- **Python unit tests** for the board's WiThrottle client and DCC steps
  under CPython against a fake station, like the interpreter's
  existing tests.

## Phases

0. **Hardware checks on the real station**, before anything is built:
   how many WiThrottle clients DCC-EX accepts; the session, turnout and
   loco messages as listed above; a virtual turnout's changes being
   announced; `rotaryio` on the XIAO ESP32-C6. A short Python script
   from the computer covers the station checks.
   **Mostly done 2026-10-29** with `test/dcc-spike.py` against Phil's
   EX-CSB1 (DCC-EX v5.6.6, ESP32, on the home network):
   - Session, power, acquire, speed, direction, F0, release and E-stop
     all work as listed above. The station first announces a 2 s
     heartbeat (`*2`), then `*10` once connected: the client should
     follow the station's `*N`, not a fixed interval. It also sends
     `HMConnecting..` / `HMConnected` messages.
   - **At most 9 WiThrottle clients** (checked twice). The 10th TCP
     connection is accepted but never answered - no error, just
     silence - so a client must treat "no `VN` within a few seconds" as
     "station full" and say so. Nine covers a handheld, a few servo
     boards and NTK, but is tight once animation boards are added.
   - **A decimal speed (`V7.5`) is accepted**: the loco crept forward,
     nothing misread. The Throttle still sends whole numbers, as
     planned, so this is only a safety check.
   - Native `<s>`, `<JT>`, `<JA>`, `<#>` (120 loco slots) answer on
     their own socket.
   - **The heartbeat safety net works**: a loco whose client stopped
     sending `*` (still connected) was stopped by the station after
     about 20 s - twice the `*10` interval. So a board that hangs or
     drops off WiFi leaves its train running for up to ~20 s.
   - Acquiring a loco (`MT+S3<;>S3`) returns its full state at once:
     all 32 functions (`F00`..`F031`, e.g. `F11` = F1 on), `s1`, speed
     and direction. An E-stopped loco reports **`V-1`**, which the
     Throttle must show as stopped, not as -1. Every `V` / `R` sent is
     echoed straight back.
   - Still to do: a virtual turnout's changes being announced (none
     defined yet), and `rotaryio` on the XIAO ESP32-C6.
1. `WiThrottleModel.js` + simulator + **DCC Station** in NTK.
2. **DCC Turnout** in NTK - first of the widgets, since servo and
   animation boards both need it and it moves no trains.
3. **On the board:** WiThrottle client + DCC Station and DCC Turnout in
   the interpreter, added to both portable lists
   (`StandaloneCompatibility.js`, `PORTABLE_TYPE_IDS`). A servo board
   following a virtual turnout is the first real standalone test.
4. ~~**Encoder**~~ - done 2026-10-27; `step` outlet added 2026-10-29
   (hardware test still to do).
5. **DCC Throttle** in NTK, then on the board - the handheld.
6. **DCC Route** in NTK, then on the board.
7. **Scene** - after refining the design with Phil; NTK, then the
   interpreter. Independent of the DCC phases (needs no station), so
   it can move earlier.
8. `DCCEXModel.js` + **DCC Program** (NTK only).
9. `docs/` pages for each widget and the widget help links, including
   virtual turnouts (DCC-EX and JMRI), servo power, and virtual
   turnouts as signals between boards.

Each phase checked against the simulator, then against the real
station.

## Decided (2026-10-19)

- **Every board runs standalone**; NTK is for building and trying
  patches live, then deploying them.
- **WiThrottle first, limited scope**: Station (power, E-stop,
  status), Throttle, Turnout. Then DCC-EX native for the programming
  track only, in NTK only.
- **WiFi / network only.** No USB serial, which also means it works the
  same in the Windows build.
- **Handheld speed comes from a rotary encoder** (new Encoder widget,
  Throttle's `step` inlet).
- **Speed inlet takes 0-126**, WiThrottle's own scale. AnalogOut-style
  input min/max fields (default 0-126) rescale anything wired in. Like
  Servo's `limitRange` (0-180), the value sent is capped to 0-126 and
  rounded; anything that isn't a number is ignored, and a negative
  value is sent as 0 (normal stop) - emergency stop is only the stop
  inlet / button.
- **Turnouts are picked from the station's list** (the `PTL` message):
  the more panel's dropdown reads e.g. "12 - Yard entry". Until the
  station is connected it shows the saved turnout only, so a loaded
  patch still works; the simulated station lists its own turnouts.
- **Throttle has 4 function inlets**, `fn1`-`fn4`, each mapped to a
  function number in the more panel (default F0-F3).
- **Boards drive virtual turnouts' points** (DCC Turnout's `value` into
  a Servo).
- **Master control with a touch screen** is a wildcard, not planned.

## Decided (2026-10-28)

- **Throttle inputs confirmed:** speed (encoder `step` or `speed`
  inlet), a direction switch (`direction`), and switches for headlight,
  sounds etc. (`fn1`-`fn4`) - all already in the Throttle design, all
  running standalone on the handheld.
- **Turnouts: virtual turnouts, with XIAO boards moving the points.**
  Turnouts the station drives itself still work with DCC Turnout.
- **Scene widget** added for story-like animations (crossing, workers);
  design to be refined.
- **DCC Route** added (WiThrottle, so it runs on boards too).
- **Accessory decoders not needed** - boards following virtual
  turnouts replace them. Moved to Later.

## Decided (2026-10-29)

- **Handheld speed: Encoder `step` -> DCC Throttle `step`.** The
  Throttle owns the speed (kept current by the station's reports);
  the Encoder gets a new `step` outlet alongside its existing `out`,
  which stays as-is for ordinary knob uses. See Rotary encoder.
- **Fractional speed:** the Throttle keeps a decimal speed and sends
  it rounded, so a fractional Encoder `step` (0.5, 1.5) gives finer
  control. See "Fractional speed" under Status updates.

## Later (not in this plan)

- **Raw command / response** on DCC Station - send any `<...>` text,
  get every reply back as text (DCC-EX native, NTK only).
- **DCC Sensor** - a detector wired to the station as a patch input.
  Mostly covered by detectors on the boards plus virtual turnouts as
  signals.
- **Track current** outlet (`<JI>`, polled).
- **Accessory decoders** (`<a addr subaddr state>`) - commercial
  devices on the track / bus wiring that drive turnout motors, signals,
  lights. Only worth adding for decoders Phil already owns, or for a
  turnout that must work without WiFi.
- **Station outputs** (`<Z id state>`) - the station's own spare pins.
- **TrackManager** - e.g. running a DC loco on a track output.
- **A DCC-EX native client on the boards** - accessory, sensor and
  output commands are native-only, so a standalone board using them
  would need one (small: same port, short text lines).
- **Sound for scenes** - a serial MP3 module (e.g. DFPlayer) driven
  from a board.
- **DCC Turnout bank** - several turnouts in one widget.
- Roster picking for the handheld (the station sends the roster in the
  session's opening messages).
- Throttle `step` going through zero into reverse; encoder
  acceleration (faster turning = bigger steps).

## Open questions

- Which EX-CommandStation version the layout runs (decides the
  programming-track reply format and how closely its WiThrottle server
  follows JMRI's), and its WiFi setup (home network vs own access
  point).
- Two Throttle widgets (or two boards) on the same loco - share it
  (both follow it), or one takes it over?
- A loco already held by another throttle: JMRI may ask to "steal" it.
  Take it over, share it, or show "in use by another throttle"? Check
  what DCC-EX does.
- Can WiThrottle report a loco's speed without taking control of it
  ("watch only", use case 3)?
- Remember turnout states on the servo board across power-ups (use
  case 2)?
