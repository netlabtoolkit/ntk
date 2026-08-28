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

1. Copy `code.py`, `firmata_server.py`, and `pins.py` onto the
   `CIRCUITPY` drive (overwriting any existing `code.py`).
2. Copy `settings.toml.example` to `settings.toml` on the same drive,
   and fill in your WiFi SSID/password.
3. The board will reset and run `code.py` automatically. Watch the
   serial console (e.g. `screen /dev/tty.usbmodem* 115200` on macOS, or
   the Mu editor's serial pane) for a line like:

   ```
   Connected. IP address: 192.168.1.42
   Firmata server listening on port 3030
   ```

4. In NTK, add an AnalogIn/AnalogOut/DigitalIn/DigitalOut/Servo widget,
   open its "more" panel, set **Device** to **Network**, and enter that
   IP address with port `3030`.

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
