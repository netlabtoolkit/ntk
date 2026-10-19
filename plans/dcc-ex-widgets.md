# DCC-EX widgets

**Status:** plan only (2026-10-19). Nothing built. Decisions from Phil
the same day are in "Decided" below.

Control a model railway's [DCC-EX](https://dcc-ex.com) command station
from NTK: track power, loco speed and direction, turnouts (points), and
the programming track. Built like AnalogOut - a value comes in an inlet,
the widget turns it into a command - but talking DCC-EX's own text
protocol instead of Firmata.

## The problem with "one widget"

DCC-EX commands don't share a shape. Speed is a continuous value for
one loco, a turnout is an on/off for one id, power is global, and the
programming track is a request that comes back with an answer
(read CV 1 -> `3`). One widget with a "command type" dropdown would need
a different set of inlets, fields and outlets for each type, which is
just several widgets in one box and hard to understand at a glance.

**Proposal: a small family of widgets sharing one connection**, the
way CloudIn and CloudOut share one broker connection per host. Each
widget does one job and has inlets/outlets that make sense for it:

| Widget | Job | Main body | Inlets | Outlets |
|---|---|---|---|---|
| **DCC Station** | Track power, emergency stop, status, any other command | Power on/off button, E-stop button, connected / power status | `power` (on when > 0.5), `stop` (rising edge = E-stop all), `command` (raw text, see below) | `power` (1/0), `response` (each raw reply as text) |
| **DCC Throttle** | One loco: speed, direction, a few functions | Speed dial (like AnalogOut's), direction toggle, stop button | `speed` (0-127), `direction` (fwd when > 0.5), `fn1`-`fn4` (on when > 0.5) | `speed`, `direction` (what the station reports, so another throttle's changes show up) |
| **DCC Turnout** | One turnout: throw / close | Big toggle showing thrown / closed | `in` (thrown when > 0.5) | `state` (1 thrown / 0 closed, as reported) |
| **DCC Program** | Programming track: read / write CVs and loco address | Read and Write buttons, CV and value fields, result readout | `read` (rising edge), `write` (rising edge), `cv`, `value` | `result` (value read, or -1 on failure), `done` (pulse) |

"More" panels hold the settings: the command station's address (shared
field, see Connection), and per widget the cab address (Throttle), the
turnout (Turnout, picked from the station's list - see Decided), which
function numbers `fn1`-`fn4` drive (Throttle, default F0 headlight,
F1, F2, F3), track (MAIN / PROG / JOIN, for
Station's power), and program-on-main mode (Program, see below).

### The long tail: a raw command inlet

Everything not covered above (sensors, accessories, EX-RAIL routes,
roster, track manager, ...) goes through DCC Station's `command` inlet
and `response` outlet: send any `<...>` text, get every reply back as
text. With NTK's existing Text, IfThen and Concat widgets that covers the
rest without NTK modeling each command, and shows which commands are
worth their own widget later. Same idea as the LLM widget's raw text in
/ text out.

## DCC-EX protocol (native commands)

From the DCC-EX command reference (dcc-ex.com, "Command Summary"),
checked 2026-10-19. Every command and reply is `<...>`; the station
also broadcasts state changes to every connected client.

- **Power:** `<1>` / `<0>` both tracks; `<1 MAIN>`, `<0 PROG>`,
  `<1 JOIN>` (prog track driven as main). Broadcast `<p1>` / `<p0>`
  (`<p1 JOIN>` etc.). `<0 JOIN>` isn't valid.
- **Throttle:** `<t cab speed dir>` - speed 0-127, -1 = emergency stop;
  dir 1 forward, 0 reverse. `<t cab>` asks for current state. Broadcast
  `<l cab reg speedByte functMap>` after any throttle change from any
  client: speedByte 128-255 forward (128 stop, 129 E-stop, 130-255 =
  speed 1-126), 0-127 reverse (0 stop, 1 E-stop, 2-127). The old
  `<t reg cab speed dir>` form is deprecated since 4.1.1.
- **Functions:** `<F cab funct state>` - funct 0-68, state 1/0. Answered
  by the `<l ...>` broadcast (functMap is a bitmap).
- **Emergency stop all:** `<!>` - an `<l ...>` reply per loco.
- **Turnouts:** `<T id state>` - 1/T throw, 0/C close. Reply
  `<H id state>`, or `<X>` if the id doesn't exist. `<T>` lists all as
  `<H ...>` lines; `<JT>` gives the ids (`<jT id1 id2 ...>`),
  `<JT id>` one turnout's state and description. Turnouts are defined
  on the command station (its config / EX-RAIL), not by NTK.
- **Programming track:** `<R cv>` -> `<v cv value>` (-1 on failure);
  `<R>` reads the loco address -> `<r address>`; `<W cv value>` writes a
  CV; `<W address>` writes the loco address. **Check the exact write
  replies against the station's firmware version before building** -
  the reference page section wasn't fully read, and these changed
  between versions.
- **Program on main (POM):** `<w cab cv value>` / `<b cab cv bit value>`
  - no reply, so nothing to confirm it worked.
- **Status:** `<s>` -> `<iDCCEX version / processor / motor shield /
  build>` plus a `<H ...>` per turnout.

## Connection

New server model, `server/modules/nlHardware/DCCEXModel.js`, registered
in `Hardware.js`'s modelMap as `DCCEX` and keyed `DCCEX:host:port`, so
every DCC widget pointed at the same station shares one connection (as
`Cloud:host:port` does). It:

- Opens a TCP socket to the station - EX-CommandStation's WiFi /
  Ethernet port is **2560** (in its own access-point mode the station
  is at `192.168.4.1`). WiFi only (see Decided), which also means it
  works the same in the Windows build, which has no serial support.
- Splits the incoming byte stream into `<...>` frames, parses the ones
  the widgets care about (`p`, `l`, `H`, `v`, `r`, `i`, `X`) into model
  updates, and passes every frame through as text for `response`.
- Sends `<s>` on connect (confirms it's really DCC-EX and gets turnout
  states) and `<t cab>` for each Throttle's cab so outlets start out
  right.
- **Rate-limits throttle commands:** a dragged dial or a sensor can send
  hundreds of values a second. Per cab, send at most every ~100 ms and
  always the latest value (same pattern as CloudModel's per-topic send
  interval). Don't resend an unchanged speed.
- Reconnects on drop, and reports failures through the existing
  `connectionFailed` / `connectionLost` / status path so the toolbar's
  "couldn't reach" message and the "in use" work apply (whether the
  station accepts more than one client - it does for WiThrottle apps -
  needs checking).

The station's address is a separate field on each DCC widget, not the
Settings drawer's Device picker (that's the NTK board). Default
`192.168.4.1:2560`. Possibly a shared "DCC station" default in the
Settings drawer later, if typing it on every widget gets old.

## Safety

A train keeps running at its last speed when NTK stops talking to it.

- DCC Throttle sends speed 0 when it's switched off or deleted.
- An "E-stop on disconnect" option (default on) on DCC Station: if NTK
  quits or the patch is closed, send `<!>` first.
- The E-stop button is always shown in Station's and Throttle's main
  bodies, never only in a "more" panel.
- DCC Program's Write needs the widget's own button or a rising edge on
  `write` - no writing on every value change, since writing the wrong CV
  (e.g. CV 1, the address, or CV 8 = reset) can make a loco
  unresponsive. Writes stay off the main track unless the program-on-main
  option is turned on, and the more panel says that POM gives no
  confirmation.

## Testing without hardware (CLAUDE.md principle)

A **simulated station** built into `DCCEXModel.js`, picked with the
address `simulated`: it keeps power, loco speeds, turnout states and a
small CV table in memory and answers commands the way a real station
does (`<p1>`, `<l ...>`, `<H ...>`, `<v cv value>`), including
broadcasts. That lets someone build and check the whole patch - a knob
into DCC Throttle, a button into DCC Turnout, reading CV 1 - before
connecting a layout. It also makes the widgets testable here, since
there's no command station on this desk.

## Phases

1. `DCCEXModel.js` (TCP, frame parsing, simulator) + **DCC Station**
   (power, E-stop, status, raw command / response). Smallest thing that
   proves the connection, and the raw inlet already gives access to
   everything.
2. **DCC Throttle** - the main use, and where rate-limiting and the
   `<l>` broadcast parsing get exercised.
3. **DCC Turnout.**
4. **DCC Program** - last: most risk (writes), least frequent use.
5. `docs/` pages for each widget and the widget help links.

Each phase checked against the simulator, then against a real station.

## Decided (2026-10-19)

- **WiFi command station.** TCP on port 2560 is the only connection
  built; USB serial is dropped from the plan unless needed later.
- **Speed inlet takes 0-127**, DCC-EX's own scale, so the widget shows
  the same numbers the station reports. AnalogOut-style input min/max
  fields (default 0-127) rescale a sensor or knob wired in (NTK's input
  widgets put out 0-1023 by default, so without that a sensor reaches
  full speed an eighth of the way along its range).
  Like Servo's `limitRange` (0-180), the value sent is capped to 0-127
  and rounded to a whole number; anything that isn't a number is
  ignored. A negative value is sent as 0 (normal stop), never as -1 -
  in DCC-EX speed -1 means emergency stop, which only the stop inlet
  and button send.
- **Turnouts are picked from a list read from the station:** the "more"
  panel's turnout dropdown is filled from `<JT>` (ids) and `<JT id>`
  (each one's description), so it reads e.g. "12 - Yard entry". Until
  the station is connected the dropdown shows the saved id only, so a
  loaded patch still works; with the simulated station it lists the
  simulator's turnouts.
- **Throttle has 4 function inlets**, `fn1`-`fn4`, each mapped to a
  function number in the "more" panel (default F0-F3).

## Open questions

- Which EX-CommandStation version the layout runs - decides the exact
  programming-track reply format (see the protocol section) - and
  whether the station is in its own access-point mode (`192.168.4.1`)
  or on the home network (then: its IP, or a `.local` name if it has
  one).
- Two Throttle widgets on the same cab - allowed (both follow the
  broadcasts), or warn?
- Does the station accept more than one client at a time (it does for
  WiThrottle apps)? If yes, NTK can share the layout with a phone
  throttle; if not, the "in use" messages apply.
- Standalone on the NTK board (a patch driving DCC-EX with NTK closed)
  is out of scope here - the board would need to talk to the station
  itself. Revisit with [standalone patch export](standalone-patch-export.md)
  if wanted.
