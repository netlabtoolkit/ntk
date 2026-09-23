# CircuitPython Firmata for the Seeed XIAO ESP32-C6

A from-scratch Firmata protocol server for CircuitPython, so a XIAO
ESP32-C6 can act as an NTK "Network" device over WiFi - no Arduino IDE,
no C++, no StandardFirmataWiFi sketch.

**Status: verified working on real hardware** (XIAO ESP32-C6, connected
to NTK's AnalogIn widget over WiFi) - handshake, capability/analog-
mapping queries, and continuous analog reporting all confirmed. Some
individual pins may not support every mode on your specific board (an
unsupported ADC/PWM/servo claim is logged and that pin is left
unclaimed rather than crashing the connection - see `pins.py` if you
need to adjust the table for your unit).

## What this covers

Digital input/output, analog input (ADC), PWM output, and servo output -
exactly what NTK's AnalogIn, AnalogOut, DigitalIn, DigitalOut, and Servo
widgets use. Deliberately **not** implemented: I2C, one-wire, stepper,
string messages. None of NTK's widgets need them.

## Setup

This board doesn't mount a `CIRCUITPY` USB drive like most CircuitPython
boards - use [Thonny](https://thonny.org/) (Tools > Options > Interpreter
> CircuitPython, pick the board's serial port) to browse and transfer
files on the device over its serial/REPL connection instead.

1. In Thonny's file browser, copy `code.py`, `ntk_firmata_main.py`,
   `firmata_server.py`, and `pins.py` onto the board (overwriting any
   existing `code.py`).
2. Copy `settings.toml.example` to `settings.toml` on the board the same
   way, and fill in your WiFi SSID/password.
3. The board will reset and run `code.py` automatically. Watch the
   serial console (e.g. `screen /dev/tty.usbmodem* 115200` on macOS, or
   Thonny's own Shell pane) for a line like:

   ```
   Connected. IP address: 192.168.1.42
   Firmata server listening on port 3030
   ```

4. In NTK, open the **Add Widgets** panel (the "+" icon) and set its
   **Device** picker at the top to **Network**, with that IP address and
   port `3030` - every AnalogIn/AnalogOut/DigitalIn/DigitalOut/Servo
   widget you add from then on defaults to this board automatically, so
   you don't have to set Device/ip/port on each one individually. A
   widget already on the canvas keeps whatever Device it already had -
   change it directly in that widget's own "more" panel instead.

   There's also an `NTK_MDNS_HOSTNAME` setting to point NTK at a
   `<name>.local` address instead of the IP - see **mDNS hostname**
   below for why it's not usable yet.

## mDNS hostname (not working yet)

**Hardware-verified 2026-09-23: this doesn't actually work on
CircuitPython 10.3.1 / this board yet.** `code.py` sets up `mdns.Server`
correctly (hostname set, `advertise_service()` called, no errors, the
console prints the expected line) but the board never answers mDNS
queries from other devices - confirmed with both a direct query and a
service browse from a Mac, against a network that resolves other real
mDNS devices (AirPlay/HomeKit/printers) fine. Left in place since it's
harmless when set and may start working on a future CircuitPython
release. Use the IP address from the boot console (or SoftAP's fixed
`192.168.4.1`) for now.

The intent, once it works: set `NTK_MDNS_HOSTNAME = "ntk-device"` (or
any name you like) in `settings.toml` and the board would advertise
itself as `ntk-device.local` on your network - point NTK's Device field
at that name and port `3030` instead of an IP address, and it would
keep working even if the router hands out a different IP later. Station
mode only (SoftAP already has a fixed IP, `192.168.4.1`). Running more
than one board on the same network? Give each a different hostname.
Needs a resolver that understands mDNS/
Bonjour - built into macOS, may need [Bonjour Print
Services](https://support.apple.com/kb/DL999) installed on Windows.

## Status LED

The board's on-board user LED (`board.LED`, GPIO15 - the small yellow one
next to the USB connector) shows what the firmware is doing, so you can
tell at a glance without the serial console:

| LED | Meaning |
|---|---|
| One fast 4-blink burst | Just powered up / reset - `code.py` is running |
| Slow steady blink (~1 Hz) | Bringing up WiFi (joining your network, or starting SoftAP) |
| Quick double-pulse every ~2 s | WiFi is up, listening on port 3030, **no client connected yet** |
| Solid on | An NTK client is connected |
| Back to the double-pulse | The client disconnected; waiting for the next one |

If the LED never gets past the slow steady blink, the board is stuck
trying to reach WiFi - check the SSID/password in `settings.toml` and the
serial console. It's harmless if your board has no such LED (or the pin
is otherwise in use): the firmware prints `(status LED unavailable: ...)`
once and carries on normally.

## SoftAP mode (no router needed)

By default the board joins the WiFi named in `settings.toml`
(`NTK_WIFI_SSID`) and gets its address from that network's DHCP -
which is why you have to read the IP off the serial console.

Set `NTK_WIFI_MODE = "ap"` in `settings.toml` to instead have the board
run **its own WiFi network**. It's then always reachable at a fixed
**`192.168.4.1`, port `3030`** - nothing to discover. Good for workshops,
demos, or any place with no usable/locked-down WiFi.

```
NTK_WIFI_MODE = "ap"
NTK_AP_SSID = "NTK-Firmata"
NTK_AP_PASSWORD = "netlabtoolkit"   # 8-63 chars; "" for an open network
```

Then join the WiFi network `NTK-Firmata` from your computer and point
NTK's **Device** picker at `192.168.4.1` / port `3030`.

Trade-offs: while your computer is on the board's network it has **no
normal WiFi / internet** (use Ethernet if you need both), it's really
**one board at a time**, and **range is shorter** than station mode - the
link is now your computer talking straight to the XIAO's small antenna
with no router to help. A XIAO ESP32-C6 with an external antenna helps if
you rely on this.

### Hang recovery - the watchdog and the escape hatch

`code.py` starts with three layers of protection against "the board is
running, looks dead, and neither Ctrl-C nor Thonny's Stop button gets a
REPL" (which happens when the hang is inside a C-level call - WiFi, I2C,
a wedged socket - where the CircuitPython VM never runs to see an
interrupt):

1. **Escape hatch.** In the first few seconds of every boot - checked
   *before* any WiFi/I2C call - **any keystroke on the serial console
   drops straight to the REPL**. Window is ~6 s when a console is already
   attached, ~3 s otherwise. So after a reset: mash a key (Enter, Ctrl-C,
   anything) and you're in.
2. **Hardware watchdog.** Armed in `RESET` mode (~20 s). If the main loop
   stops petting it - a real hang - the chip **hard-resets** itself.
   `RESET` is the only mode that escapes a stuck C call. The board then
   reboots, and the escape hatch above gives you your window.
3. **Reset-loop guard.** If the last **3 resets in a row** were all the
   watchdog firing, something is persistently wedged - `code.py` prints a
   message and **stops at the REPL instead of booting the server again**.
   A healthy run (server up ~30 s) clears the counter. Stored in
   `microcontroller.nvm`, so it survives the resets.

So the normal recovery from a genuine hang is now: *wait ~20 s for the
watchdog to reset the board → press a key during the boot window → REPL*.
No unplugging required.

**If the board seems stuck on boot while starting SoftAP**: unlike
`wifi.radio.connect()` (station mode), which takes a `timeout` so
Ctrl-C gets a window to land between retries, `wifi.radio.start_ap()`
has no such option - there's no way to bound or interrupt that specific
call from Python if it hangs. The general escape hatch above (a
keystroke in the first few seconds of boot) is the only window to catch
before it starts; the watchdog isn't armed yet at that point either
(see `code.py`'s own comment for why SoftAP has to start before
anything else, including the watchdog setup, is even imported), so a
genuine hang inside `start_ap()` itself needs **Thonny's Stop button**
to force an interrupt.

**If the board seems stuck on boot before it even gets that far (neither
Ctrl-C nor Thonny's Stop button work)**: `pins.py` probes each
configured Grove I2C sensor at import time (`board.I2C()` calls), which
can hang at the hardware driver level - not just raise an error - if
that bus currently has no pull-ups, a sensor disconnected mid-
transaction, or similar. A hang at that level blocks before
CircuitPython's VM ever checks for an interrupt, which is what can make
even Thonny's Stop button ineffective. There's no "press Ctrl-C now"
countdown before this specific import (one was tried and removed - see
the next note below for why it didn't actually help the failure mode
that mattered). The **watchdog** now covers it: the board resets within
~20 s and the boot-window keystroke gets you a REPL. If it keeps
happening, **disconnect the Grove sensor(s)** and check wiring/pull-ups
before reattaching.

**If you unplugged the board while Thonny was already connected, and
now can't get a REPL back no matter what you press**: this is a known
Thonny quirk reconnecting to a board that's already mid-boot (Thonny's
own auto-reconnect can race the board's boot in a way that leaves Ctrl-C
not actually reaching it, even though the SoftAP countdown above still
prints normally) - it isn't something this firmware can control from
its side. Reliable recovery: **switch Thonny's interpreter away from the board's
serial port, unplug the board, replug it and wait about 10 seconds
without touching Thonny, then switch Thonny's interpreter back to that
port** - the REPL comes back cleanly once Thonny only attaches after the
board has already finished booting on its own, instead of racing it.

## Optional: Grove sensors (NTK's GroveIn widget)

Wire a supported Grove sensor to the board (I2C pins for most; a
digital pin for the DHT11, see below) and copy this folder's `lib/`
subfolder onto the device (Thonny, alongside
`code.py`/`ntk_firmata_main.py`/`firmata_server.py`/`pins.py`) - no other setup needed.
`pins.py` detects each I2C sensor at boot (skipped silently, no error,
if not attached, wired wrong, or the bus lacks pull-ups - see
Troubleshooting below) and makes it available to add a **GroveIn**
widget for in NTK, over the same connection as every other widget - no
second board or separate connection required. Pick the sensor from the
widget's own dropdown; readings arrive as soon as the device replies.

Supported so far:

- **3-Axis Digital Accelerometer (LIS3DHTR)** - X/Y/Z acceleration in
  m/s^2, scaled by the widget to NTK's usual 0-1023 range (default
  scaling assumes normal handling/tilting, roughly 1g of swing per
  axis, not the sensor's full +/-2g range - adjust in the widget's
  "more" panel if you need to capture harder shake/impact forces).
- **Time of Flight Distance Sensor (VL53L0X)** - single distance
  reading in mm. Hardware-verified; `pins.py` applies a fixed -50mm
  calibration offset to this module's raw readings (measured
  empirically - see its `_VL53L0X_OFFSET_MM` comment), so a different
  physical module/housing may need that constant re-measured. Readings
  well under ~50mm are inherently unreliable on this sensor regardless
  of the offset - a near-field optical crosstalk limitation of the
  VL53L0X itself, not something firmware can calibrate away. With
  nothing in range at all, the sensor reports a large "no target"
  sentinel value rather than 0 or an error - clamped in `pins.py` to
  the sensor's rated ~1200mm max (`_VL53L0X_MAX_RANGE_MM`) so it reads
  the same as "an object right at the edge of range" instead of
  spiking the widget's scaled output several times past NTK's normal
  0-1023 convention.
- **Temperature & Humidity Sensor (DHT11)** - single-wire digital, not
  I2C, so it can't be auto-detected on the shared bus like the sensors
  above - wire it to any free digital Grove socket (avoid D0-D2, which
  NTK claims automatically as analog inputs) and enter that pin (e.g.
  `D7`) in the widget's "more" panel pin field once DHT11 is selected
  from the dropdown.
- **Digital Light Sensor (TSL2561)** - single lux reading, real-world
  units (1:1 passthrough, same as DHT11 above, not NTK's usual 0-1023
  convention). Hardware-verified. The underlying driver returns no
  reading at all (reported here as 0) both when it's genuinely dark AND
  when the sensor is saturated by too much light for its current
  settings - those read identically for now; a bright-light test reading
  0 would mean it's hitting the saturation case, not real darkness.
- **Ultrasonic Ranger** - single distance reading in mm, roughly 2cm-350cm
  range. Single-wire digital like DHT11 above (one pin does both trigger
  and echo) - wire it to any free digital Grove socket (avoid D0-D2) and
  enter that pin in the widget's "more" panel pin field. Hardware-
  verified. No CircuitPython driver exists for this specific 1-pin
  module, so `pins.py` bit-bangs the trigger/echo timing directly, with a
  slower ~300ms update interval than most sensors here since this module
  needs more settle time between pings than its own datasheet suggests;
  with nothing in range, it reads as maximum distance rather than 0 or an
  error, same convention as the Time of Flight sensor above.

An accelerometer can *also* still be read the older way - as three
ordinary-looking analog pins, **A3**, **A4**, and **A5** (unused by any
real pin on this board) - so an AnalogIn widget pointed at any of those
reads live acceleration exactly like it would a potentiometer (0 =
-2g, middle of the dial = flat/at rest, 1023 = +2g). Both paths read
the same physical sensor and can be used at once; the GroveIn widget
is the newer, more general path and is what future sensors will use
exclusively.

## Optional: run a patch standalone, no host required

**Status: built and hardware-verified (2026-09-17), still v1** - see `plans/standalone-patch-export.md` in the main NTK repo for the full design and open items.

Normally every bit of patch logic runs on the host (NTK itself) - this firmware is just a dumb Firmata relay, and closing NTK or disconnecting the board from it stops everything. `standalone_interpreter.py`, if present on the device, changes that: it loads a saved patch and evaluates it directly on the board, driving real GPIO with no host connected at all.

Setup:

1. In NTK, build your patch and click **Export Standalone** (in the Settings drawer, next to the regular Export button). If the patch uses a widget the interpreter can't run, NTK tells you exactly which one instead of exporting a broken file.
2. Copy the downloaded `standalone_patch.json`, plus this folder's `standalone_interpreter.py`, onto the board via Thonny alongside `code.py`/`ntk_firmata_main.py`/`firmata_server.py`/`pins.py`.
3. Reboot the board. The serial console prints `Standalone patch loaded and compatible: standalone_patch.json`, and the board starts running the patch on its own - watch for `Standalone interpreter running (no client connected)`.

Supported widgets: AnalogIn, AnalogOut, DigitalIn, DigitalOut, Servo, GroveSensor, and all the pure logic/generator widgets (IfThen, Boolean, Gate, Mix, Splitter, Process, Count, Concat, Pulse, Sequence, Tween, Data) - the same widgets a `.ntk` patch already saves, no special "standalone" version needed. Not supported: Gesture (an open on-device performance question, not yet resolved) and anything that needs a browser (camera/AI widgets, Text/Image/Button, etc.) - NTK's Export Standalone button already checks this before letting you export.

While the interpreter is running (no client connected), the serial console takes two single-key commands, no Enter needed - handy for verifying a patch without ever connecting NTK: `t` reprints the patch's topology (e.g. `A0 -> AnalogIn -> Splitter -> Mix -> Servo -> D5`), and `v` prints every live inlet/outlet value along those same chains (e.g. `A0 -> AnalogIn(out=847) -> Splitter(out4=64) -> Mix(out1=61) -> Servo(out=61.0) -> D5(61.0)`).

**Reconnecting NTK to the board hands control back to NTK, not just "watches."** The moment a client connects, the interpreter stops and releases every pin it was driving, exactly like it would for a live (non-standalone) connection - there's no way to peek at the interpreter running without taking over from it. This is deliberate (it's what keeps the interpreter and a connected NTK from ever fighting over the same pin), not a bug. Disconnecting hands control back to the interpreter again automatically.

Nothing here changes if you never copy `standalone_interpreter.py` or `standalone_patch.json` onto the board - the firmware behaves exactly as it always has.

## Pin mapping

See `pins.py` for the authoritative table and how to adjust it if your
CircuitPython build names pins differently.

| Firmata pin | XIAO pin | Analog-capable |
|---|---|---|
| 0-5 | D0-D5 | yes (same physical pins as A0-A5) |
| 6-10 | D6-D10 | no |

## Known hardware limit

The ESP32-C6 has 6 PWM (LEDC) channels total, so at most 6 pins can be
configured as PWM or Servo outputs at the same time. Trying to add a
7th will raise an error from `pwmio` - reduce simultaneous PWM/Servo
widgets if you hit this.

## Troubleshooting

- **NTK never shows "connected"**: check the IP printed on the serial
  console is current (it can change if your router reassigns a lease)
  and that port 3030 isn't blocked by a firewall between your computer
  and the board.
- **Board prints an error and stops**: reconnect the serial console to
  see the traceback - CircuitPython prints exceptions there, including
  ones from a pin name that doesn't match your specific board (see
  `pins.py`).
- **Values look scaled wrong**: this reports analog values as 0-1023
  and expects PWM writes as 0-255, matching classic Arduino - if
  something upstream is assuming ESP32-native ranges (0-4095 ADC, 0-255
  vs 0-65535 PWM), that's the mismatch to look for.
- **An I2C device (accelerometer, distance sensor, etc.) prints "No pull up
  found on SDA or SCL; check your wiring"**: a real electrical issue,
  not a false-positive check - I2C is open-drain and genuinely can't
  work without pull-up resistors somewhere on the bus. Most Grove I2C
  modules supply their own, but an older/cheaper one might not, and not
  every Grove expander's I2C port does either. Fix: two resistors
  (4.7k-10k ohm) from SDA to 3V3 and from SCL to 3V3 - many Grove
  expander boards expose individual SDA/SCL/3V3 pins on a breakout
  header specifically for this, separate from the Grove connectors
  themselves.
- **An I2C device does nothing, and (calling `i2c.scan()` yourself in
  the REPL) the scan finds no devices at all even after adding
  pull-ups**: double
  check it's plugged into the socket actually labeled I2C (often also
  labeled with an analog pin, e.g. "A5") - the numbered Grove sockets
  (D5, D7, etc.) look physically identical but most of them are plain
  digital pins with no SDA/SCL wired to them at all, so plugging an I2C
  device into one of those looks exactly like a wiring/pull-up problem
  from the software side (an `OSError: [Errno 5] Input/output error` -
  ESP32 CircuitPython's generic way of reporting "nothing ACKed") but is
  actually just the wrong socket.
