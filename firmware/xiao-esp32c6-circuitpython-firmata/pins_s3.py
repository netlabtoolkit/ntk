"""
XIAO ESP32-S3 Sense pin map, in Firmata pin-index order.

Board-verified 2026-09-25 via the live REPL (not assumed from the C6
table) - see firmware/xiao-esp32c6-circuitpython-firmata/pins.py for
the fuller explanation of this file's shape/PIN_TABLE format; only the
board-specific differences are noted here.

Unlike the XIAO ESP32-C6, D3/D4/D5 DO work as analog input on this
board/unit (analogio.AnalogIn succeeded on D0-D5, failed with "Invalid
pin" from D6 on) - so all six are included as analog channels 0-5
below, not just D0-D2. D0-D10 all confirmed working as digital I/O and
PWM. ESP32-S3 has 8 LEDC channels (vs the C6's 6), so up to 8 pins can
be PWM/servo at once here.

This is the "Sense" variant (adds a camera, mic, and SD card slot over
the plain XIAO ESP32-S3) - none of that is used by NTK; board.CAM_*/
MIC_*/SDCS are simply not referenced here.

No Grove sensors tested/attached yet - GROVE_SENSOR_CATALOG starts
empty, same graceful-if-absent shape as the C6 file. Copy entries over
from the C6 pins.py if/when a sensor is attached to this board; nothing
about them is C6-specific (I2C/GPIO based, not chip-specific).

Deployment: this file is NOT the one that gets imported as-is - the
firmware imports a plain `pins.py` (see ntk_firmata_main.py's `from
pins import PIN_TABLE, GROVE_SENSOR_CATALOG`), and this directory's
own pins.py is the C6 table by default. To deploy to a XIAO ESP32-S3
Sense instead, copy THIS file over CIRCUITPY's pins.py (renaming it in
the process), same manual "copy the right file" convention already
used for every other board-specific choice in this project (deliberate -
see pins.py's own note on why this isn't auto-detected at runtime).
Pulled from a live, already-configured S3 Sense board 2026-10-02, not
freshly re-verified at that time - the hardware claims above are still
from the original 2026-09-25 verification.
"""

import board

GROVE_SENSOR_CATALOG = {}

PIN_TABLE = [
    (board.D0, 0, None),
    (board.D1, 1, None),
    (board.D2, 2, None),
    (board.D3, 3, None),
    (board.D4, 4, None),
    (board.D5, 5, None),
    (board.D6, None, None),
    (board.D7, None, None),
    (board.D8, None, None),
    (board.D9, None, None),
    (board.D10, None, None),
]

print("Grove sensors found: none")
