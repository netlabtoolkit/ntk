"""
XIAO ESP32-S3 Sense pin map, in Firmata pin-index order. This is the
default pins.py for this directory (S3 Sense is the recommended board
- see pins_c6.py for the XIAO ESP32-C6 table instead, and this
directory's own README.md for the "copy the right file" deploy
convention).

Board-verified 2026-09-25 via the live REPL (not assumed from the C6
table) - see pins_c6.py for the fuller explanation of this file's
shape/PIN_TABLE format; only the board-specific differences are noted
here.

Unlike the XIAO ESP32-C6, D3/D4/D5 DO work as analog input on this
board/unit (analogio.AnalogIn succeeded on D0-D5, failed with "Invalid
pin" from D6 on) - so all six are included as analog channels 0-5
below, not just D0-D2. D0-D10 all confirmed working as digital I/O and
PWM. ESP32-S3 has 8 LEDC channels (vs the C6's 6), so up to 8 pins can
be PWM/servo at once here.

This is the "Sense" variant (adds a camera, mic, and SD card slot over
the plain XIAO ESP32-S3) - none of that is used by NTK; board.CAM_*/
MIC_*/SDCS are simply not referenced here.

Grove sensor support below is ported from pins_c6.py (2026-10-02) -
NOT yet hardware-verified on a physical S3 Sense board with a sensor
actually attached (the C6 file's own version was verified hands-on;
this port carries the same I2C/GPIO logic, which isn't chip-specific,
but hasn't been re-confirmed on this chip). One real difference from
the C6 version: the LIS3DHTR accelerometer's three virtual analog
pins use channels 6-8 here, not 3-5 - on the C6, channels 3-5 are free
because D3-D5 are digital-only there; on the S3, D3/D4/D5 are real
analog channels 3-5 already (see above), so the virtual pins had to
move past the six real ones to avoid colliding with them on the same
Firmata analog index.
"""

import board
import time

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
    (board.D3, 3, None),
    (board.D4, 4, None),
    (board.D5, 5, None),
    (board.D6, None, None),
    (board.D7, None, None),
    (board.D8, None, None),
    (board.D9, None, None),
    (board.D10, None, None),
]

# Optional: Grove - 3-Axis Digital Accelerometer (LIS3DHTR), I2C. Exposed
# as three "virtual" analog pins (X/Y/Z, no real board_pin) using analog
# channels 6-8 - unused by any real pin above (D0-D5 are all real analog
# channels 0-5 on this board, unlike the C6 where D3-D5 are digital-only
# and channels 3-5 are free - see this file's own docstring), so no
# collision. A widget just wires up to A6/A7/A8 like any other analog
# input; nothing else in NTK or the rest of this firmware needs to know
# these aren't real ADC pins.
#
# Entirely optional and silently skipped if the sensor isn't attached
# or the bus lacks pull-ups - PIN_TABLE just ends up three entries
# shorter, same as if this whole block were never here.
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

    PIN_TABLE.append((None, 6, _make_accel_axis_reader(0)))  # A6 = accel X
    PIN_TABLE.append((None, 7, _make_accel_axis_reader(1)))  # A7 = accel Y
    PIN_TABLE.append((None, 8, _make_accel_axis_reader(2)))  # A8 = accel Z

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
# Hardware-verified on the C6 (via the GroveSensor widget); not yet
# re-confirmed on this board - ported here unchanged since none of
# this is chip-specific (I2C address/registers, not GPIO).
#
# Measured calibration offset (from the C6 unit this was verified on):
# that module read a consistent ~50mm FAR of actual distance in its
# normal operating range (150mm measured as ~200mm, 250mm measured as
# ~300mm - the same ~50mm both times, not a percentage error), so it's
# corrected here with a flat subtraction rather than in
# sensorCatalog.js/the widget, since it's a property of the specific
# sensor module, not something NTK should have to know about. Adafruit's
# adafruit_vl53l0x driver exposes no built-in offset-calibration call
# (unlike some other ToF libraries), so this is the only place to apply
# one. Re-measure and adjust this constant for whichever physical
# module/housing is actually attached to this board - right at contact
# (~0mm actual) the raw reading jumps to ~80mm instead of following
# that same ~50mm pattern on the C6 unit, a known VL53L0X near-field
# limitation (optical crosstalk between the emitter and receiver
# dominates the return signal at very short range), not something a
# flat offset can correct; readings well under ~50mm actual distance
# should be treated as unreliable regardless of this correction.
_VL53L0X_OFFSET_MM = 50

# Measured (C6 unit): with nothing in range at all, the sensor doesn't
# report an error or a small/zero value - it returns a large
# sentinel-ish raw reading (~7030mm there, well past its ~1200mm rated
# max), which is normal VL53L0X "no valid target" behavior, not a
# fault. Left uncorrected, that would sail straight through
# sensorCatalog.js's scale-to-0-1023 conversion (SignalChainFunctions.js's
# scale() does a plain linear transform with NO clamping to the
# configured inputCeiling) and spike the outlet to several times the
# normal 0-1023 range - clamped here instead so "nothing in range"
# reads the same as "an object sitting right at the sensor's rated max
# distance", which is the conventional way ToF sensors handle this case.
_VL53L0X_MAX_RANGE_MM = 1200  # matches sensorCatalog.js's declared ceiling

try:
    import adafruit_vl53l0x

    _tof_i2c = board.I2C()
    _tof_sensor = adafruit_vl53l0x.VL53L0X(_tof_i2c)

    GROVE_SENSOR_CATALOG[1] = {
        "read": lambda: [min(_VL53L0X_MAX_RANGE_MM, max(0, _tof_sensor.range - _VL53L0X_OFFSET_MM))],
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
# Hardware-verified end-to-end on the C6 unit (subscribe/pin-field/
# readings all the way through the GroveSensor widget), wired to D7
# there - not yet re-confirmed on this board, ported unchanged since
# none of this is chip-specific. Avoid D0-D5 on THIS board (all six are
# analog-capable here, unlike the C6 where only D0-D2 are) - NTK's
# server claims every analog-capable pin automatically as an input the
# moment it connects (see the addDefaultPins() limitation noted in
# pins_c6.py), conflicting with the DHT11's own pin claim. D6-D10 are
# digital-only here and safe to use.
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

# Optional: Grove - Digital Light Sensor (TSL2561), I2C, fixed address
# 0x29 on this specific Grove module (per Seeed's own wiki page for it -
# NOT the adafruit_tsl2561 library's own default of 0x39, which is the
# bare TSL2561 chip's floating-ADDR-pin address; the Grove breakout
# hard-wires ADDR to GND instead, no address-select jumper exposed).
# GroveSensor catalog entry 3 - single reading, same one-element-list
# shape as VL53L0X's entry 1, but the VALUE that one reading carries
# depends on a "mode" the widget's own dropdown selects (see
# sensorCatalog.js's `modes` and GroveSensor.js's needsMode handling) -
# the sensor has two separate photodiodes (one full-spectrum, one
# infrared-only) and Seeed's own docs for this module describe three
# ways to read it: infrared only, full-spectrum only, or "human visible"
# (both diodes combined, calibrated to approximate the eye's response -
# what adafruit_tsl2561's `.lux` property already computes). Hardware-
# verified on the C6 unit (address/wiring); not yet re-confirmed on this
# board - ported unchanged since none of this is chip-specific.
#
# needs_mode mirrors needs_pin (DHT11) above almost exactly - a 4th
# sysex byte the widget sends at SUBSCRIBE time - except it never claims
# an exclusive hardware resource, so make_read() always returns a
# cleanup_fn of None; kept as the same (read_fn, cleanup_fn) tuple shape
# purely so firmata_server.py's subscription bookkeeping doesn't need a
# third code path.
#
# Deliberately numbered so VISIBLE is 0: firmata_server.py's needs_mode
# handling falls back to mode 0 if a subscribe request arrives with no
# mode byte at all (an older/simpler client, or a race before the
# widget's own dropdown value has round-tripped) - lining that fallback
# up with the already-verified-working reading, rather than the generic
# protocol code needing to know anything TSL2561-specific about which
# mode is "the good default".
_TSL2561_MODE_VISIBLE = 0
_TSL2561_MODE_FULL_SPECTRUM = 1
_TSL2561_MODE_INFRARED = 2

# firmata_server.py's _encode_grove_value() packs every reading as a
# fixed-point x100 value into a 21-bit wire field - a hard ceiling of
# +/-10485.76 that every OTHER Grove sensor's natural range happens to
# fit safely under (VL53L0X's ~1200mm, LIS3DHTR's ~+/-20 m/s^2, DHT11's
# 0-100). TSL2561 is the first one that doesn't: lux can reach ~40,000
# per its own datasheet, and raw broadband/infrared channel counts go up
# to 65535 (16-bit). Left uncorrected, a bright-light reading in ANY of
# the three modes could silently wrap into a garbage (or seemingly
# negative) value over the wire instead of erroring - clamped here
# rather than raising the wire format's ceiling itself, which would
# touch every other Grove sensor's encoding, not just this one.
_TSL2561_WIRE_MAX = 10000

try:
    import adafruit_tsl2561

    _light_i2c = board.I2C()
    _light_sensor = adafruit_tsl2561.TSL2561(_light_i2c, address=0x29)

    def _make_tsl2561_read(mode):
        if mode == _TSL2561_MODE_INFRARED:
            read = lambda: [min(_TSL2561_WIRE_MAX, _light_sensor.infrared)]
        elif mode == _TSL2561_MODE_FULL_SPECTRUM:
            read = lambda: [min(_TSL2561_WIRE_MAX, _light_sensor.broadband)]
        else:
            # Visible/lux is the default (see firmata_server.py's
            # needs_mode handling for what happens with no mode byte at
            # all) - the one of the three already confirmed working.
            #
            # adafruit_tsl2561's own `.lux` property returns None (not a
            # number) in two different situations: genuinely no light at
            # all (ch0 == 0), and sensor saturation (too bright for the
            # current gain/integration settings) - the library doesn't
            # expose a way to tell those apart without inspecting the raw
            # broadband/infrared channel values and replicating its own
            # saturation-threshold logic. Collapsed to 0 here for both
            # cases as a simple starting point (accurate for "no light",
            # misleading for "too bright" - reads as dark instead of
            # blindingly bright) - revisit once real hardware shows which
            # case actually comes up in practice; a bright-light test
            # that reads 0 would confirm it's hitting the saturation
            # case, not genuine darkness.
            read = lambda: [min(_TSL2561_WIRE_MAX, _light_sensor.lux or 0)]
        return read, None

    GROVE_SENSOR_CATALOG[3] = {
        "needs_mode": True,
        "make_read": _make_tsl2561_read,
        # Default integration_time (2/402ms) is the slowest/most precise
        # of the driver's three presets - polling faster than that would
        # just re-send the same stale reading, same reasoning as
        # VL53L0X's min_interval_ms above.
        "min_interval_ms": 500,
    }
    _found_sensors.append("TSL2561 light sensor")
except Exception:
    pass

# Optional: Grove - Ultrasonic Ranger, single-wire digital (one SIG pin
# doing double duty as trigger output AND echo input) - NOT I2C, same
# "needs_pin" shape as DHT11 above: no shared bus to find it on, so it
# needs to know which GPIO it's wired to, and can't be probed at boot.
# GroveSensor catalog entry 4 - single reading (distance in mm), same
# one-element-list shape as VL53L0X's entry 1.
#
# No Adafruit/CircuitPython driver exists for this specific 1-pin Grove
# module (adafruit_hcsr04 is for the 2-pin trigger+echo HC-SR04), so this
# bit-bangs the protocol directly.
#
# Protocol (per Seeed's wiki for this module): pull SIG low briefly, then
# high for >=10us to trigger a ping, then switch the same pin to input
# and time how long it stays high during the echo - that duration times
# the speed of sound (343 m/s), halved for the round trip, is the
# distance.
#
# HARDWARE HISTORY (2026-09-05, several rounds against real hardware -
# on the C6 unit; not yet re-confirmed on this board, ported unchanged
# since none of this is chip-specific):
#   1. First version used pulseio.PulseIn for echo capture - tearing down
#      the trigger's digitalio object and building a brand-new PulseIn
#      (an RMT peripheral) on every read. Pinned at max range always -
#      RMT setup/teardown took long enough that a close object's echo
#      (as short as ~120us) was over before capture even started.
#      Rewritten to reuse ONE persistent digitalio.DigitalInOut object,
#      just flipping .direction between OUTPUT (trigger) and INPUT
#      (echo) and busy-waiting on .value directly - Arduino's pulseIn()
#      technique, spelled out by hand.
#   2. That fixed capture, but close-range readings jittered between ~0
#      and the real value. Tried a pull-down on the echo pin (electrical
#      noise theory) - didn't help. Tried time.monotonic_ns() instead of
#      time.monotonic() (CircuitPython's Python floats are 32-bit, losing
#      precision on sub-millisecond gaps once the board's uptime grows -
#      kept, since it's strictly more correct, but didn't fix the jitter
#      alone either).
#   3. Tried median-of-3 samples per read() (theory: the ESP32's WiFi
#      stack, a separate higher-priority FreeRTOS task, briefly
#      preempting the busy-wait). This stabilized the jitter but
#      introduced a NEW, large, inconsistent-direction error (160mm
#      measured as ~125mm, then ~45mm after adding inter-ping delays -
#      got WORSE, not better) - ruled out as the wrong theory entirely.
#   4. A standalone script (test_ultrasonic.py, single ping every 300ms,
#      none of the median/delay complexity) measured 160mm as 146.5mm -
#      accurate. This isolated the real cause: 60ms between pings (both
#      the inter-sample gap tried in step 3, AND min_interval_ms below)
#      is simply too fast for this transducer's own mechanical ringing
#      to settle - not WiFi preemption, not float precision. Simplified
#      back to a single ping per read() (median-of-3 was solving the
#      wrong problem) with a much longer min_interval_ms below, matching
#      what the standalone test proved works.
_ULTRASONIC_MAX_RANGE_MM = 3500  # Seeed's rated max for this module is ~350cm
_ULTRASONIC_ECHO_TIMEOUT_S = 0.05  # 50ms >> the ~20ms a max-range echo takes

try:
    _ultrasonic_now_ns = time.monotonic_ns
except AttributeError:
    def _ultrasonic_now_ns():
        return int(time.monotonic() * 1000000000)

def _make_ultrasonic_read(pin):
    import digitalio

    # Created once per subscription, not per read - reused across every
    # call below by flipping .direction, which is a cheap register-level
    # operation. Idles as an input between reads/trigger pulses. Pull.DOWN
    # (not left floating) - cheap hardening against the pin picking up
    # noise during the brief gap before the sensor starts driving its
    # response, though the float-precision issue above (not noise) turned
    # out to be the real cause of the 0mm jitter seen on real hardware.
    io = digitalio.DigitalInOut(pin)
    io.switch_to_input(pull=digitalio.Pull.DOWN)

    def _ping():
        # Trigger: briefly drive the same pin high for >=10us.
        io.switch_to_output(value=False)
        time.sleep(0.000002)
        io.value = True
        time.sleep(0.00001)
        io.value = False
        io.switch_to_input(pull=digitalio.Pull.DOWN)

        # Echo: busy-wait for the pin to go high (echo pulse starts),
        # then busy-wait for it to go low again (echo pulse ends), timing
        # the high duration directly - the same thing Arduino's
        # pulseIn() does, just spelled out by hand, using an integer
        # nanosecond clock (see above) instead of time.monotonic()'s
        # imprecise float.
        timeout_at_ns = _ultrasonic_now_ns() + int(_ULTRASONIC_ECHO_TIMEOUT_S * 1000000000)
        while not io.value:
            if _ultrasonic_now_ns() > timeout_at_ns:
                # No echo ever started - nothing in range (or nothing
                # wired up correctly). Same "read as max distance, not
                # an error" convention as VL53L0X's no-target sentinel
                # above, since this is normal sensor behavior, not a
                # fault.
                return _ULTRASONIC_MAX_RANGE_MM
        pulse_start_ns = _ultrasonic_now_ns()
        while io.value:
            if _ultrasonic_now_ns() > timeout_at_ns:
                return _ULTRASONIC_MAX_RANGE_MM
        pulse_end_ns = _ultrasonic_now_ns()

        echo_us = (pulse_end_ns - pulse_start_ns) / 1000
        return min(_ULTRASONIC_MAX_RANGE_MM, (echo_us * 0.343) / 2)

    def read():
        # Single ping, no median/retry - see the HARDWARE HISTORY note
        # above for why simpler turned out to be more accurate here
        # (on the C6 unit this was verified on).
        return [_ping()]

    def cleanup():
        io.deinit()

    return read, cleanup

GROVE_SENSOR_CATALOG[4] = {
    "needs_pin": True,
    "make_read": _make_ultrasonic_read,
    # Hardware-confirmed 2026-09-05 on the C6 unit (see HARDWARE HISTORY
    # above): this transducer's own mechanical ringing needs meaningfully
    # longer than Seeed's own quoted ">=60ms" to fully settle between
    # pings - 60ms produced large, inconsistent errors; 300ms (matching
    # test_ultrasonic.py, which measured accurately) did not. Not yet
    # re-confirmed on this board.
    "min_interval_ms": 300,
}
# Not added to _found_sensors below, same reasoning as DHT11 above - this
# entry is always registered (no optional library import to fail), but
# whether a sensor is actually wired up isn't knowable until a widget
# subscribes with a real pin.

print("Grove sensors found:", ", ".join(_found_sensors) if _found_sensors else "none")
