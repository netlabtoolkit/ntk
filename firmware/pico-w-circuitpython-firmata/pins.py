"""
Raspberry Pi Pico W pin map, in Firmata pin-index order.

Each entry is (board_pin_object_or_None, analog_channel_or_None,
virtual_read_or_None). If `import board; print(sorted(dir(board)))` at
the CircuitPython REPL shows different names on your specific unit/
CircuitPython version, edit this table to match - nothing else in this
project needs to change.

Hardware-verified 2026-09-30 (CircuitPython 10.3.1, Pico W) by actually
constructing digitalio.DigitalInOut/pwmio.PWMOut/analogio.AnalogIn on
every pin `board` exposes, not assumed from the datasheet:

  GP0-GP22            -> digital + PWM only
  GP26/A0, GP27/A1, GP28/A2 -> digital + PWM + ANALOG IN

That matches the RP2040's actual 3-ADC-input hardware limit exactly -
no surprises like the XIAO ESP32-C6's D3-D5 rejecting analogio despite
looking fine on paper. GP23/GP24/GP25/GP29 are not exposed by `board`
at all on this board - GP23/24/25 are wired internally to the CYW43
wireless chip (SPI-style control interface for onboard WiFi/BT), GP29
to the VSYS voltage-sense divider - so there was nothing to test there.

GP8/GP9 are excluded below (present and fully capable per the test
above, but reserved) - hardware-verified 2026-09-30: this Grove Shield
for Pi Pico's dedicated "I2C" Grove connector is wired to GP8 (SDA)/
GP9 (SCL), not board.STEMMA_I2C()'s pins (that bus found no pull-ups
at all - nothing physically wired to it on this shield). A live scan
of GP8/GP9 found a device at 0x3C, the OLED oled_display.py expects -
see that file's own comment. Same pattern as the XIAO firmware
excluding D4/D5 for its onboard I2C bus. If a future unit's shield
routes I2C to different pins, re-run the scan (busio.I2C on candidate
pairs, i2c.scan()) rather than assuming these.

Caveat, not yet hit in practice but real on this chip: RP2040 PWM
pins share one of 8 hardware "slices" in pairs - two pins on the same
slice+channel can each have an independent duty cycle, but NOT an
independent frequency; the second pwmio.PWMOut() call silently retunes
the first pin's frequency too. Only matters if two PWM/Servo outputs
are active on the same slice pair at once with genuinely different
frequencies (NTK's Servo widget defaults to the same ~50Hz for every
instance, so this is unlikely to bite). Sharing pairs among the pins
above: (GP0,GP16) (GP1,GP17) (GP2,GP18) (GP3,GP19) (GP4,GP20)
(GP5,GP21) (GP6,GP22) (GP10,GP26) (GP11,GP27) (GP12,GP28).

No onboard sensors on this board/shield combo - GROVE_SENSOR_CATALOG
starts empty, same extensible pattern as the XIAO firmware (add a
probe block below, same shape as that file's Grove LIS3DHTR one, if a
sensor's soldered directly to a future unit).
"""

import board

GROVE_SENSOR_CATALOG = {}

_found_sensors = []

PIN_TABLE = [
    (board.GP0, None, None),
    (board.GP1, None, None),
    (board.GP2, None, None),
    (board.GP3, None, None),
    (board.GP4, None, None),
    (board.GP5, None, None),
    (board.GP6, None, None),
    (board.GP7, None, None),
    # GP8/GP9 reserved for the Grove shield's I2C port (OLED) - see the
    # module docstring above.
    (board.GP10, None, None),
    (board.GP11, None, None),
    (board.GP12, None, None),
    (board.GP13, None, None),
    (board.GP14, None, None),
    (board.GP15, None, None),
    (board.GP16, None, None),
    (board.GP17, None, None),
    (board.GP18, None, None),
    (board.GP19, None, None),
    (board.GP20, None, None),
    (board.GP21, None, None),
    (board.GP22, None, None),
    (board.GP26, 0, None),
    (board.GP27, 1, None),
    (board.GP28, 2, None),
]

if _found_sensors:
    print("Grove sensors found:", ", ".join(_found_sensors))
