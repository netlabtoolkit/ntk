"""
XIAO ESP32-C6 pin map, in Firmata pin-index order.

Each entry is (board_pin_object, analog_channel_or_None). XIAO boards
keep pin names consistent across variants (D0-D10, with D0-D5 doubling
as A0-A5 on the same physical pins) - this is what that naming is based
on. If `import board; print(dir(board))` at the CircuitPython REPL shows
different names on your specific unit/CircuitPython version, edit this
table to match - nothing else in this project needs to change.

Firmata pin index -> XIAO pin:
  0-5  -> D0-D5 (also usable as ANALOG IN, via the same physical pins)
  6-10 -> D6-D10 (digital only)

Hardware note: the ESP32-C6 has 6 PWM (LEDC) channels total, so at most
6 pins can be configured as PWM or SERVO at the same time - trying to
add a 7th will raise an error from pwmio.
"""

import board

PIN_TABLE = [
    (board.D0, 0),
    (board.D1, 1),
    (board.D2, 2),
    (board.D3, 3),
    (board.D4, 4),
    (board.D5, 5),
    (board.D6, None),
    (board.D7, None),
    (board.D8, None),
    (board.D9, None),
    (board.D10, None),
]
