# DCC widgets (WiThrottle, then DCC-EX)

**Status:** plan only (2026-10-19). Nothing built. Decisions from Phil
the same day are in "Decided" below.

Control a model railway's command station from NTK: track power, loco
speed and direction, turnouts (points), and - later, on DCC-EX - the
programming track. Built like AnalogOut - a value comes in an inlet,
the widget turns it into a command - but talking a railway protocol
instead of Firmata.

## Two protocols, WiThrottle first

- **WiThrottle** (JMRI's throttle protocol, what Engine Driver and the
  WiThrottle app speak) covers driving: power, locos, turnouts, with
  every change announced to every client. DCC-EX speaks it natively on
  its usual port 2560, and so does JMRI (port 12090 by default) - which
  in turn talks to nearly any system (Digitrax, NCE, Lenz, ...) - plus
  Digitrax's LNWI and other WiFi throttle servers. So the driving
  widgets aren't tied to DCC-EX.
- **DCC-EX native** (`<...>` commands) is only needed for what
  WiThrottle doesn't have: the programming track (reading / writing
  CVs). It comes after the WiThrottle widgets, and only DCC Program
  uses it.

The patch side doesn't depend on the protocol: the widgets, inlets and
outlets are the same whatever the station is. A layout run from JMRI
gets every widget except DCC Program.

## The widgets

DCC commands don't share a shape - speed is a continuous value for one
loco, a turnout is an on/off for one id, power is global, and the
programming track is a request that comes back with an answer. One
widget with a "command type" dropdown would be several widgets in one
box. So: **a small family of widgets sharing one connection**, the way
CloudIn and CloudOut share one broker connection per host.

| Widget | Protocol | Job | Main body | Inlets | Outlets |
|---|---|---|---|---|---|
| **DCC Station** | WiThrottle | Track power, emergency stop, connection status | Power on/off button, E-stop button, connected / power status | `power` (on when > 0.5), `stop` (rising edge = E-stop) | `power` (1/0), `connected` (1/0) |
| **DCC Throttle** | WiThrottle | One loco: speed, direction, a few functions | Speed dial (like AnalogOut's), direction toggle, stop button | `speed` (0-126), `direction` (fwd when > 0.5), `fn1`-`fn4` (on when > 0.5) | `speed`, `direction`, `fn1`-`fn4` (as the station reports them, so another throttle's changes show up) |
| **DCC Turnout** | WiThrottle | One turnout: throw / close, or follow it | Big toggle showing thrown / closed | `in` (thrown when > 0.5) | `state` (1 thrown / 0 closed, as reported), `value` (the "closed" or "thrown" value - for driving a Servo, see "NTK as the turnout's motor") |
| **DCC Program** | DCC-EX | Programming track: read / write CVs and loco address | Read and Write buttons, CV and value fields, result readout | `read` (rising edge), `write` (rising edge), `cv`, `value` | `result` (value read, or -1 on failure), `done` (pulse) |

"More" panels hold the settings: the station's address (see
Connection), and per widget the loco address (Throttle), the turnout
(Turnout, picked from the station's list), which function numbers
`fn1`-`fn4` drive (Throttle, default F0 headlight, F1, F2, F3), the
closed / thrown values (Turnout), and program-on-main mode (Program).

Kept out of this plan to keep it small - see "Later": a raw command
inlet, sensors, track current.

## NTK as the turnout's motor

A command station can hold turnouts that have no hardware of their own:
DCC-EX's `VIRTUAL_TURNOUT(id, "description")` in `myAutomation.h`
(EX-RAIL), or an internal turnout (`IT...`) in JMRI. They show up in
every throttle's turnout list and can be thrown from anywhere - Engine
Driver, a physical throttle, an EX-RAIL route, NTK - but nothing moves.

NTK can be what moves them. The station announces every turnout change
to every client, so a DCC Turnout widget follows the turnout whoever
threw it, and its `value` outlet wired into a Servo widget on an NTK
board moves the points:

    DCC Turnout (12 - Yard entry) --value--> Servo (pin 9)

- `value` sends the "closed" or "thrown" number from the more panel
  (defaults 80 / 100, a small swing - set per turnout to match the
  points). Wiring `value` through a Tween first gives a slow,
  prototypical movement instead of a snap.
- On connect NTK gets every turnout's current state, so the servos go
  to the right position when the patch starts. A turnout whose state
  the station reports as unknown doesn't send anything.
- The station's state is the one truth: NTK's own Turnout toggle throws
  the turnout on the station, and the servo moves when that change comes
  back, the same path as a throw from anywhere else. So the points never
  disagree with what every throttle shows - as long as NTK is running.
  While NTK is closed, throwing the turnout changes the station's state
  but nothing moves; the points catch up when NTK connects again.
- The servo can also be driven by any other NTK output - a DigitalOut
  for a solenoid driver, a NeoPixel for a signal - since it's just a
  value outlet.
- Running this without NTK open (the board following the station by
  itself) needs the board to speak WiThrottle - see "Standalone" in Open
  questions.

## WiThrottle protocol

Line-based text over TCP, each message ending in a newline. From JMRI's
"WiThrottle protocol" page. **Check each message against a real DCC-EX
station before building** - DCC-EX's own WiThrottle server is a
reimplementation and may differ from JMRI in the details.

- **Session:** client sends `N<name>` (e.g. `NNTK`) and `HU<unique id>`.
  The server answers with its version (`VN2.0`), roster (`RL...`),
  power state (`PPA0` / `PPA1` / `PPA2` unknown), turnout list (`PTL`)
  and heartbeat interval (`*10` = seconds).
- **Heartbeat:** client sends `*` at least once per interval (NTK: every
  half interval); `*+` turns monitoring on. If the heartbeat stops,
  the server stops that client's locos - a safety net if NTK hangs or
  the WiFi drops.
- **Power:** `PPA1` on / `PPA0` off, from either side.
- **Turnouts:** list `PTL]\[<system name>}|{<user name>}|{<state>...`,
  state 1 unknown, 2 closed, 4 thrown. Client sends `PTAC<name>` close,
  `PTAT<name>` throw. Every change, from any client, comes back as
  `PTA2<name>` / `PTA4<name>`.
- **Locos** (multi-throttle commands, `M` + throttle id + action):
  - Acquire: `MT+S3<;>S3` (S short address, L long - NTK picks L above
    127). The server answers with the function labels and current
    state: `MTAS3<;>V0`, `MTAS3<;>R1`, `MTAS3<;>F00` ...
  - Speed `MTAS3<;>V50` (0-126), E-stop `MTAS3<;>X`, direction
    `MTAS3<;>R1` forward / `R0` reverse.
  - Functions: `MTAS3<;>f13` sets F3 on, `f03` off (the "force" form -
    sets the state directly instead of a button press / release, so
    latching vs momentary doesn't matter).
  - Release `MT-S3<;>r`. `MTA*<;>X` E-stops every loco this client has.
  - Changes to a loco NTK has acquired come back as `MTA...` lines, so
    another throttle driving the same loco shows up.
- **Quit:** `Q`.

## DCC-EX native protocol (DCC Program only)

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

New server models in `server/modules/nlHardware/`, registered in
`Hardware.js`'s modelMap and keyed by host and port, so every widget
pointed at the same station shares one connection (as
`Cloud:host:port` does):

- **`WiThrottleModel.js`** (`WiThrottle:host:port`): opens the session,
  keeps the heartbeat, acquires each Throttle's loco (one WiThrottle
  throttle id for all of NTK's locos), keeps the latest power / turnout
  / loco state and hands it to the widgets.
- **`DCCEXModel.js`** (`DCCEX:host:port`), phase 4: a second socket to
  the same station for DCC Program. DCC-EX accepts several clients at
  once (that's how several phones run one layout), so this doesn't need
  to share the WiThrottle socket.

Both:

- **Rate-limit throttle commands:** a dragged dial or a sensor can send
  hundreds of values a second. Per loco, send at most every ~100 ms and
  always the latest value (same pattern as CloudModel's per-topic send
  interval). Don't resend an unchanged speed.
- Reconnect on drop, and report failures through the existing
  `connectionFailed` / `connectionLost` / status path, so the toolbar's
  "couldn't reach" message applies.

The station's address is a field on each DCC widget, not the Settings
drawer's Device picker (that's the NTK board). Default
`192.168.4.1:2560` (DCC-EX in its own access-point mode); a JMRI
server is usually port 12090. Possibly a shared "DCC station" default
in the Settings drawer later, if typing it on every widget gets old.

### Status updates

The station announces changes to every connected client, whoever made
them - a phone throttle, a physical throttle, an EX-RAIL automation, or
another NTK. Each widget shows its part:

- **Power** (`PPA`): Station's power button and `power` outlet.
- **Locos** (`MTA...V / R / F` for locos NTK has acquired): Throttle's
  dial, direction toggle and outlets.
- **Turnouts** (`PTA`): Turnout's toggle and `state` / `value` outlets.
- **Connection** (socket up / down): Station's `connected` outlet and
  every DCC widget's status text.

Everything arrives in the session's opening messages too, so widgets
start out right instead of waiting for the next change.

**A remote change vs a wired inlet:** if another throttle changes a
loco's speed, NTK's dial and outlets follow it. If the Throttle's
`speed` inlet is also wired, the next value from that inlet wins again -
the inlet is the patch's instruction, the display is the layout's
current state. Changes NTK made itself come back too; they only update
the display, never get sent again.

## Safety

A train keeps running at its last speed when NTK stops talking to it.

- DCC Throttle sends speed 0 and releases the loco when it's switched
  off or deleted.
- E-stop (Station's button / `stop` inlet) sends `MTA*<;>X` - every
  loco NTK is driving. It doesn't reach locos driven only by other
  throttles; that's what the station's own power off is for, and the
  more panel says so.
- An "E-stop on disconnect" option (default on) on DCC Station: if NTK
  quits or the patch is closed, E-stop first. The WiThrottle heartbeat
  covers the case where NTK can't send anything (crash, WiFi drop).
- The E-stop button is always in Station's and Throttle's main bodies,
  never only in a "more" panel.
- DCC Program's Write needs the widget's own button or a rising edge on
  `write` - no writing on every value change, since writing the wrong CV
  (e.g. CV 1, the address, or CV 8 = reset) can make a loco
  unresponsive. Writes stay off the main track unless the program-on-main
  option is turned on, and the more panel says that POM gives no
  confirmation.

## Testing without hardware (CLAUDE.md principle)

A **simulated station**, picked with the address `simulated`: it keeps
power, loco speeds, a few turnouts (including "virtual" ones) and a
small CV table in memory, and answers like a real one - WiThrottle for
Station / Throttle / Turnout, `<v cv value>` for Program - including
announcing changes. That lets someone build and check a whole patch - a
knob into DCC Throttle, a DCC Turnout driving a Servo, reading CV 1 -
before connecting a layout. It also makes the widgets testable here,
since there's no command station on this desk.

## Phases

1. `WiThrottleModel.js` (session, heartbeat, parsing, simulator) +
   **DCC Station** (power, E-stop, status). The smallest thing that
   proves the connection.
2. **DCC Throttle** - the main use, and where rate-limiting and the
   acquire / follow handling get exercised.
3. **DCC Turnout**, including the follow-and-drive-a-Servo use.
4. `DCCEXModel.js` + **DCC Program** - last: most risk (writes), least
   frequent use, DCC-EX only.
5. `docs/` pages for each widget and the widget help links, with the
   virtual-turnout setup (DCC-EX and JMRI) on DCC Turnout's page.

Each phase checked against the simulator, then against a real station.

## Decided (2026-10-19)

- **WiThrottle first, limited scope**: Station (power, E-stop,
  status), Throttle, Turnout. Then DCC-EX native for the programming
  track only.
- **WiFi / network only.** No USB serial, which also means it works the
  same in the Windows build.
- **Speed inlet takes 0-126**, WiThrottle's own scale, so the widget
  shows the same numbers the station reports. AnalogOut-style input
  min/max fields (default 0-126) rescale a sensor or knob wired in
  (NTK's input widgets put out 0-1023 by default). Like Servo's
  `limitRange` (0-180), the value sent is capped to 0-126 and rounded;
  anything that isn't a number is ignored, and a negative value is sent
  as 0 (normal stop) - emergency stop is only the stop inlet / button.
- **Turnouts are picked from the station's list** (the `PTL` message):
  the more panel's dropdown reads e.g. "12 - Yard entry". Until the
  station is connected it shows the saved turnout only, so a loaded
  patch still works; the simulated station lists its own turnouts.
- **Throttle has 4 function inlets**, `fn1`-`fn4`, each mapped to a
  function number in the more panel (default F0-F3).
- **Turnouts can be driven by NTK** (virtual turnouts on the station,
  followed by DCC Turnout's `value` outlet into a Servo).

## Later (not in this plan)

All of these need DCC-EX native commands, so they'd come after phase 4
if wanted:

- **Raw command / response** on DCC Station - send any `<...>` text, get
  every reply back as text, for everything not modelled as a widget.
- **DCC Sensor** - a layout detector (block occupancy, a button, a reed
  switch) as a patch input (`<Q id>` / `<q id>`). WiThrottle has no
  sensors.
- **Track current** outlet (`<JI>`, polled).

## Open questions

- Which EX-CommandStation version the layout runs (decides the
  programming-track reply format and how closely its WiThrottle server
  follows JMRI's), and whether the station is in its own access-point
  mode (`192.168.4.1`) or on the home network (its IP, or a `.local`
  name if it has one).
- Two Throttle widgets on the same loco - share one acquired loco
  (both follow it), or warn?
- A loco already held by another throttle: JMRI may ask to "steal" it.
  Take it over, share it, or show "in use by another throttle"? Check
  what DCC-EX does.
- Standalone on the NTK board (the board follows the station's turnouts
  and drives servos with NTK closed) is out of scope - the board would
  need its own WiThrottle client. Revisit with
  [standalone patch export](standalone-patch-export.md) if the virtual
  turnout use turns out to be the main one.
