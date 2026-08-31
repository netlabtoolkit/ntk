"""
Quick standalone test for a Grove - Temperature & Humidity Sensor
(DHT11), unrelated to the Firmata firmware - just to confirm the sensor
and wiring work before building anything else on top of it.

Setup:
1. Plug the DHT11 into a DIGITAL Grove socket (e.g. "D2") on the Grove
   expander, and change DHT_PIN below to match if you use a different one.
2. This needs Adafruit's adafruit_dht library, which isn't part of core
   CircuitPython. This folder's own lib/ subfolder (matching CircuitPython
   10.x) already has adafruit_dht.mpy - in Thonny's file browser, copy the
   whole lib/ folder onto the device's root (same transfer method as the
   other firmware files - this board has no CIRCUITPY drive to
   drag-and-drop onto). No other library files are needed for this test.
3. In Thonny, open this file and click Run (no need to rename it to
   code.py - Thonny can run any script directly on the device).
"""

import time
import board
import adafruit_dht

DHT_PIN = board.D2

dht = adafruit_dht.DHT11(DHT_PIN)

while True:
    try:
        print("Temperature: %d C   Humidity: %d %%" % (dht.temperature, dht.humidity))
    except RuntimeError as e:
        # DHT11 reads regularly fail this way (bad checksum, timing miss) -
        # completely normal, just skip this reading and try again.
        print("Reading failed, retrying:", e)

    # DHT11 needs at least ~1s between reads; 2s is a safe margin.
    time.sleep(2)
