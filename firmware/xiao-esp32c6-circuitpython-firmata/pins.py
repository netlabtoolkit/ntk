"""
XIAO ESP32-C6 pin map, in Firmata pin-index order.

Each entry is (board_pin_object, analog_channel_or_None). XIAO boards
keep pin names consistent across variants (D0-D10, with D0-D5 doubling
as A0-A5 on the same physical pins) - this is what that naming is based
on. If `import board; print(dir(board))` at the CircuitPython REPL shows
different names on your specific unit/CircuitPython version, edit this
table to match - nothing else in this project needs to change.

Firmata pin index -> XIAO pin:
  0-2  -> D0-D2 (also usable as ANALOG IN, via the same physical pins)
  3-10 -> D3-D10 (digital/PWM/servo only)

D3-D5 are marked as digital-only here (analog_channel=None) even though
they're physically the same dual-purpose pins as D0-D2, for two
reasons specific to this board unit: (1) analogio.AnalogIn actually
raised "Invalid pin" on D3/D4/D5 on real hardware - they don't work as
analog input here regardless of what this table says; (2) NTK's own
StandardFirmataModel.js (server/modules/nlHardware/, not part of
Firmata itself) sorts every pin the device reports as analog-capable
into inputs-only at connect time (addDefaultPins()), permanently
excluding it from ever being available as a Servo/AnalogOut/DigitalOut
target - a real NTK-side limitation, not a Firmata protocol one (see
the CircuitPython Firmata firmware memory note for the fuller story).
Marking D3-D5 as digital-only works around both issues at once and
costs nothing on this unit, since they didn't work as analog input
anyway. If you need analog input specifically on D3-D5 on a different
board/unit where they DO work, restore their channel numbers here, but
they'll then be unavailable as output targets in NTK until that host-
side limitation is fixed properly.

Hardware note: the ESP32-C6 has 6 PWM (LEDC) channels total, so at most
6 pins can be configured as PWM or SERVO at the same time - trying to
add a 7th will raise an error from pwmio.
"""

import board

PIN_TABLE = [
    (board.D0, 0),
    (board.D1, 1),
    (board.D2, 2),
    (board.D3, None),
    (board.D4, None),
    (board.D5, None),
    (board.D6, None),
    (board.D7, None),
    (board.D8, None),
    (board.D9, None),
    (board.D10, None),
]
