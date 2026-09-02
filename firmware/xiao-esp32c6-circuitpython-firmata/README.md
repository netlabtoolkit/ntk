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

1. In Thonny's file browser, copy `code.py`, `firmata_server.py`, and
   `pins.py` onto the board (overwriting any existing `code.py`).
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

## SoftAP mode (no router needed)

By default the board joins the WiFi named in `settings.toml`
(`CIRCUITPY_WIFI_SSID`) and gets its address from that network's DHCP -
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

**If the board seems stuck on boot while starting SoftAP**: unlike
`wifi.radio.connect()` (station mode), which takes a `timeout` so
Ctrl-C gets a window to land between retries, `wifi.radio.start_ap()`
has no such option - there's no way to bound or interrupt that specific
call from Python if it hangs. There's an 8-second "press Ctrl-C now"
countdown (re-printed every second) right before it starts, so Ctrl-C
works if you catch that - but if it's already past that and hung inside
`start_ap()` itself, only **Thonny's Stop button** can force a harder
interrupt.

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
that mattered) - if this happens, **disconnect the Grove sensor(s) and
power-cycle the board** to get back in, then check wiring/pull-ups
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

## Optional: show the IP on a Grove LCD RGB Backlight

Wire a [Grove - LCD RGB Backlight](https://wiki.seeedstudio.com/Grove-LCD_RGB_Backlight/)
to the board's I2C pins and it'll show the station-mode IP address (and
turn the backlight green) once connected - no serial console needed.
Nothing to configure - `grove_lcd.py` is used automatically if present,
and if the display isn't attached, wired wrong, or the bus lacks
pull-ups (see Troubleshooting below), it's skipped silently and the
board boots normally either way.

## Optional: Grove sensors (NTK's GroveIn widget)

Wire a supported Grove sensor to the board (I2C pins for most; a
digital pin for the DHT11, see below) and copy this folder's `lib/`
subfolder onto the device (Thonny, alongside
`code.py`/`firmata_server.py`/`pins.py`) - no other setup needed.
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
  convention). **Not yet hardware-tested** - remove this note once
  verified. The underlying driver returns no reading at all (reported
  here as 0) both when it's genuinely dark AND when the sensor is
  saturated by too much light for its current settings - those read
  identically for now; a bright-light test reading 0 would mean it's
  hitting the saturation case, not real darkness.

An accelerometer can *also* still be read the older way - as three
ordinary-looking analog pins, **A3**, **A4**, and **A5** (unused by any
real pin on this board) - so an AnalogIn widget pointed at any of those
reads live acceleration exactly like it would a potentiometer (0 =
-2g, middle of the dial = flat/at rest, 1023 = +2g). Both paths read
the same physical sensor and can be used at once; the GroveIn widget
is the newer, more general path and is what future sensors will use
exclusively.

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
- **An I2C device (Grove LCD, accelerometer, etc.) prints "No pull up
  found on SDA or SCL; check your wiring"**: a real electrical issue,
  not a false-positive check - I2C is open-drain and genuinely can't
  work without pull-up resistors somewhere on the bus. Most Grove I2C
  modules supply their own, but an older/cheaper one might not, and not
  every Grove expander's I2C port does either. Fix: two resistors
  (4.7k-10k ohm) from SDA to 3V3 and from SCL to 3V3 - many Grove
  expander boards expose individual SDA/SCL/3V3 pins on a breakout
  header specifically for this, separate from the Grove connectors
  themselves.
