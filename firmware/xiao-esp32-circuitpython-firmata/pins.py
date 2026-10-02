"""
Auto-detecting dispatcher - picks the right pin table for whichever
XIAO ESP32 board this actually is, and re-exports it under the plain
names ntk_firmata_main.py imports (`from pins import PIN_TABLE,
GROVE_SENSOR_CATALOG`). The real tables live in pins_s3.py (XIAO
ESP32-S3 Sense) and pins_c6.py (XIAO ESP32-C6) - see their own
docstrings for the actual pin data and Grove sensor support.

Added 2026-10-02, replacing the previous "copy the right file and
rename it to pins.py by hand" convention - that worked fine for a
plain CIRCUITPY drag-and-drop, but Thonny's file transfer (needed for
the XIAO ESP32-C6, which has no CIRCUITPY drive at all - see this
directory's README) can't rename a file as part of uploading it,
making that rename a genuinely awkward extra manual step for anyone
deploying to a C6. This way, every board gets the exact same three
files (this one, pins_s3.py, pins_c6.py), unchanged, every time - no
renaming, no picking the right one by hand.

Detection is a direct hardware probe, not a board.board_id string
match: analogio.AnalogIn(board.D3) succeeds on the S3 Sense and raises
ValueError ("Invalid pin") on the C6 - this is the exact, already
hardware-verified difference between the two boards' own pin tables
(see pins_s3.py/pins_c6.py's own docstrings), not a new guess. A
string match against board.board_id would also work today, but would
silently stop matching if a future board variant used a different ID
string for the same underlying chip - probing the actual capability
that the two pin tables already differ on doesn't have that risk.
Low-risk by construction: this is the same construct-then-release
pattern firmata_server.py already uses to probe pins, immediately
deinit()'d either way, so the probe itself never leaves the pin
claimed before the real firmware claims it for actual use.
"""

import board
import analogio


def _s3_analog_pins_present():
    try:
        probe = analogio.AnalogIn(board.D3)
        probe.deinit()
        return True
    except ValueError:
        return False


if _s3_analog_pins_present():
    from pins_s3 import PIN_TABLE, GROVE_SENSOR_CATALOG
else:
    from pins_c6 import PIN_TABLE, GROVE_SENSOR_CATALOG
