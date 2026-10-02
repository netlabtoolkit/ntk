"""
Standalone diagnostic for the Grove Ultrasonic Ranger, unrelated to the
Firmata firmware - prints RAW per-ping echo timing directly, with none
of the median-of-3/inter-ping-delay/output-scaling machinery pins.py's
GroveSensor catalog entry has. Use this to see the actual timing
behavior when the derived distance number alone isn't enough to tell
what's going wrong.

Setup:
1. Plug the sensor's SIG pin into a digital Grove socket (e.g. "D7") and
   change PIN below to match if you use a different one - avoid D0-D2
   (reserved for analog input).
2. In Thonny, open this file and click Run (no need to rename it to
   code.py or touch the real firmware - this runs standalone, same as
   test_dht11.py).
3. Hold a flat object (a book, a wall) at a few KNOWN distances (measured
   from the round metal transducer's front face) and watch the printed
   numbers. Ctrl-C to stop.

What to look for:
- Is echo_us/distance_mm roughly CONSTANT at a fixed real distance (a
  timing bug affecting every ping the same way), or does it VARY a lot
  ping to ping (occasional corruption of individual pings)?
- Does distance_mm track changes in real distance in the right
  direction and rough proportion (move the object further away - does
  the number go up by roughly the right amount)?
- Any "no echo"/"echo never ended" lines, and how often?
"""

import time
import board
import digitalio

PIN = board.D7
ECHO_TIMEOUT_S = 0.05

io = digitalio.DigitalInOut(PIN)
io.switch_to_input(pull=digitalio.Pull.DOWN)

try:
    _now_ns = time.monotonic_ns
except AttributeError:
    def _now_ns():
        return int(time.monotonic() * 1000000000)


def ping():
    """One trigger + echo-timing cycle. Returns (echo_us, distance_mm),
    or a string explaining why it failed."""
    io.switch_to_output(value=False)
    time.sleep(0.000002)
    io.value = True
    time.sleep(0.00001)
    io.value = False
    io.switch_to_input(pull=digitalio.Pull.DOWN)

    timeout_at_ns = _now_ns() + int(ECHO_TIMEOUT_S * 1000000000)

    while not io.value:
        if _now_ns() > timeout_at_ns:
            return "no echo ever started"
    pulse_start_ns = _now_ns()

    while io.value:
        if _now_ns() > timeout_at_ns:
            return "echo never ended (stuck high)"
    pulse_end_ns = _now_ns()

    echo_us = (pulse_end_ns - pulse_start_ns) / 1000
    distance_mm = (echo_us * 0.343) / 2
    return echo_us, distance_mm


print("Hold a flat object at a KNOWN distance from the transducer face.")
print("Ctrl-C to stop.\n")

while True:
    result = ping()
    if isinstance(result, str):
        print(result)
    else:
        echo_us, distance_mm = result
        print("echo_us=%7.1f   distance_mm=%7.1f" % (echo_us, distance_mm))
    # Well over Seeed's own "over 60ms between measurements" guidance -
    # generous on purpose so THIS script's own timing isn't in question.
    time.sleep(0.3)
