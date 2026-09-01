"""
XIAO ESP32-C6 pin map, in Firmata pin-index order.

Each entry is (board_pin_object_or_None, analog_channel_or_None,
virtual_read_or_None). XIAO boards keep pin names consistent across
variants (D0-D10, with D0-D5 doubling as A0-A5 on the same physical
pins) - this is what that naming is based on. If
`import board; print(dir(board))` at the CircuitPython REPL shows
different names on your specific unit/CircuitPython version, edit this
table to match - nothing else in this project needs to change.

A pin with board_pin=None is "virtual" - not a real GPIO, just a
sensor reading exposed through Firmata's ordinary analog-pin reporting
(see firmata_server.py's _VirtualAnalogIn). virtual_read is then a
zero-arg function returning a raw 16-bit value (0-65535); it's what
makes that work. See the Grove LIS3DHTR block below for the first one.

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

# GroveSensor widget catalog (see firmata_server.py's GROVE_SENSOR_REQUEST/
# GROVE_SENSOR_REPLY) - sensor_id -> {"read": fn() -> list of floats,
# "min_interval_ms": int}. Deliberately separate from PIN_TABLE/
# analog_channel: this is a newer, less constrained path (real physical
# units, not squeezed into Firmata's 0-1023 analog convention) for
# sensors added from now on. Starts empty; populated below only for
# sensors actually found attached, same graceful-skip-if-absent pattern
# as everything else in this file.
GROVE_SENSOR_CATALOG = {}

# Names of Grove sensors actually detected below, printed as one summary
# line once all the optional probes below have run (see the bottom of
# this file) - each probe fails silently (bare `except Exception: pass`)
# on its own, since "sensor not attached" is the everyday case, not a
# real error worth a scary-looking traceback-adjacent print every single
# boot; this list is what tells you what WAS found instead.
_found_sensors = []

PIN_TABLE = [
    (board.D0, 0, None),
    (board.D1, 1, None),
    (board.D2, 2, None),
    (board.D3, None, None),
    (board.D4, None, None),
    (board.D5, None, None),
    (board.D6, None, None),
    (board.D7, None, None),
    (board.D8, None, None),
    (board.D9, None, None),
    (board.D10, None, None),
]

# Optional: Grove - 3-Axis Digital Accelerometer (LIS3DHTR), I2C. Exposed
# as three "virtual" analog pins (X/Y/Z, no real board_pin) using analog
# channels 3-5 - unused by any real pin above (D3-D5 are digital-only on
# this unit, see the comment above), so no collision. A widget just wires
# up to A3/A4/A5 like any other analog input; nothing else in NTK or the
# rest of this firmware needs to know these aren't real ADC pins.
#
# Entirely optional and silently skipped if the sensor isn't attached
# (or the bus lacks pull-ups - see the Grove LCD memory note for that
# exact failure mode) - PIN_TABLE just ends up three entries shorter,
# same as if this whole block were never here.
try:
    import adafruit_lis3dh

    _accel_i2c = board.I2C()
    try:
        _accelerometer = adafruit_lis3dh.LIS3DH_I2C(_accel_i2c, address=0x18)
    except (ValueError, OSError):
        _accelerometer = adafruit_lis3dh.LIS3DH_I2C(_accel_i2c, address=0x19)

    # LIS3DH defaults to its +/-2g range; acceleration.value is in m/s^2,
    # so full scale is ~19.6 (2 * standard gravity). Mapped onto the same
    # raw 16-bit range a real analogio.AnalogIn would report, so the
    # existing ANALOG polling/scaling code in firmata_server.py's
    # update() needs no changes at all: -2g -> 0, 0g (flat, at rest) ->
    # ~32768 (the middle of NTK's usual 0-1023 range), +2g -> 65535.
    _ACCEL_FULL_SCALE_MS2 = 19.6

    def _make_accel_axis_reader(axis_index):
        def read():
            g = _accelerometer.acceleration[axis_index]
            raw16 = (g / _ACCEL_FULL_SCALE_MS2) * 32767 + 32768
            return int(min(max(raw16, 0), 65535))
        return read

    PIN_TABLE.append((None, 3, _make_accel_axis_reader(0)))  # A3 = accel X
    PIN_TABLE.append((None, 4, _make_accel_axis_reader(1)))  # A4 = accel Y
    PIN_TABLE.append((None, 5, _make_accel_axis_reader(2)))  # A5 = accel Z

    # Also reachable as GroveSensor catalog entry 0 - same underlying
    # sensor object, just real m/s^2 units instead of squeezed into
    # Firmata's 0-1023 analog convention. Both paths can be used at once
    # (e.g. while transitioning existing AnalogIn widgets over to a
    # dedicated GroveSensor widget) - reading .acceleration doesn't
    # change any state, so there's no conflict between them.
    GROVE_SENSOR_CATALOG[0] = {
        "read": lambda: list(_accelerometer.acceleration),
        "min_interval_ms": 20,
    }
    _found_sensors.append("LIS3DHTR accelerometer")
except Exception:
    pass

# Optional: Grove - Time of Flight Distance Sensor (VL53L0X), I2C, fixed
# address 0x29 (41 decimal) - no address-pin strap to try alternates,
# unlike the LIS3DH above. GroveSensor catalog entry 1 only - no
# virtual-analog-pin fallback for this one (that path was the earlier,
# now-superseded approach; every sensor added from here on only needs
# the GroveSensor catalog). Single reading (distance in mm), so
# GROVE_SENSOR_CATALOG's "read" returns a one-element list rather than
# LIS3DH's three, matching however many readings the widget-side
# sensorCatalog.js entry declares.
#
# Hardware-verified: readings come back in mm as expected via the
# GroveSensor widget. Entirely optional and silently skipped if not
# attached, same graceful-skip pattern as the accelerometer above.
try:
    import adafruit_vl53l0x

    _tof_i2c = board.I2C()
    _tof_sensor = adafruit_vl53l0x.VL53L0X(_tof_i2c)

    GROVE_SENSOR_CATALOG[1] = {
        "read": lambda: [_tof_sensor.range],
        # VL53L0X's default measurement_timing_budget is ~33ms per
        # reading - polling much faster than that would just re-send the
        # same stale reading.
        "min_interval_ms": 50,
    }
    _found_sensors.append("VL53L0X distance sensor")
except Exception:
    pass

# Optional: Grove - Temperature & Humidity Sensor (DHT11), single-wire
# digital - NOT I2C, so unlike every entry above it isn't on the shared
# bus and can't be probed at boot: it needs to know which GPIO pin it's
# wired to. "needs_pin": True tells firmata_server.py to wait for a pin
# number in the widget's own subscribe request (see GroveSensor.js's pin
# field) instead of reading eagerly - "make_read" is called with the
# real board pin object once that arrives, returning (read_fn,
# cleanup_fn); cleanup_fn releases the sensor's PulseIn claim on that
# pin when the widget unsubscribes, switches sensors, or picks a
# different pin (see firmata_server.py's _unsubscribe_grove_sensor).
#
# Hardware-verified end-to-end (subscribe/pin-field/readings all the
# way through the GroveSensor widget), wired to D7 on this unit - avoid
# D0-D2, which NTK's server claims automatically as analog inputs the
# moment it connects (see the addDefaultPins() limitation noted at the
# top of this file), conflicting with the DHT11's own pin claim.
try:
    import adafruit_dht

    def _make_dht11_read(pin):
        sensor = adafruit_dht.DHT11(pin)

        def read():
            return [sensor.temperature, sensor.humidity]

        def cleanup():
            sensor.exit()

        return read, cleanup

    GROVE_SENSOR_CATALOG[2] = {
        "needs_pin": True,
        "make_read": _make_dht11_read,
        # DHT11 can only be read reliably every ~1-2s; faster than that
        # raises a checksum/timing error rather than returning bad data
        # (see test_dht11.py's comment) - firmata_server.py already
        # reports that as a normal per-read GROVE_STATUS_ERROR rather
        # than dropping the connection, so this is just pacing, not
        # error-avoidance.
        "min_interval_ms": 2000,
    }
    # Not added to _found_sensors below - unlike the I2C sensors above,
    # this only confirms the adafruit_dht library imported, not that a
    # DHT11 is actually wired up (that isn't knowable until a widget
    # subscribes with a real pin - see needs_pin above).
except Exception:
    pass

print("Grove sensors found:", ", ".join(_found_sensors) if _found_sensors else "none")
