"""
Quick standalone test for a Grove - LCD RGB Backlight, unrelated to the
Firmata firmware - just to confirm the display and its I2C wiring work
before relying on code.py's own use of it (showing the board's IP at
boot; see grove_lcd.py).

Setup:
1. Wire the display to the board's I2C Grove socket (SDA/SCL/3V3/GND).
2. This needs grove_lcd.py (this folder's own from-scratch driver, no
   official Adafruit library exists for this display) already on the
   device alongside this script - copy it over in Thonny's file browser
   if it isn't there yet. No other library files are needed.
3. In Thonny, open this file and click Run (no need to rename it to
   code.py - Thonny can run any script directly on the device).

What to look for:
- Construction failing with "No pull up found on SDA or SCL" means a
  real electrical issue - I2C needs pull-up resistors somewhere on the
  bus and not every Grove port/expander supplies its own (see this
  firmware's README Troubleshooting section for the fix: two 4.7k-10k
  ohm resistors, SDA to 3V3 and SCL to 3V3).
- Construction failing with "OSError: [Errno 5] Input/output error"
  instead means the bus itself came up fine but nothing ACKed at the
  text controller's address (0x3E) - ESP32 CircuitPython reports every
  I2C NACK this same generic way, not just "no pull up" cases. The scan
  below runs first specifically to disambiguate this: no addresses at
  all still points at wiring/pull-ups, while a scan that's missing 0x3E
  but finds 0x62/0x30 means the backlight driver is alive but the text
  controller specifically isn't answering (bad/failing unit, or - since
  this exact error can also mean "too soon after power-up" for this
  controller - try power-cycling the display and rerunning before
  assuming the unit's bad).
- First, "Hello from NTK!" / "LCD text test OK" should appear across
  both 16-character lines and stay up for a few seconds - check for
  garbled, missing, or shifted characters, which would point at a flaky
  I2C connection (weak/marginal pull-ups, a loose Grove cable) rather
  than a construction failure.
- Then the backlight should visibly step through red / green / blue /
  white every second, printed here as each one changes - if the text
  keeps updating but the backlight never changes color, this specific
  board's backlight driver chip (PCA9633 @ 0x62 or SGM31323 @ 0x30)
  didn't respond during init; grove_lcd.py silently no-ops set_rgb() in
  that case rather than fail the whole display.
"""

import time
import board
from grove_lcd import GroveLCD

i2c = board.I2C()
while not i2c.try_lock():
    pass
try:
    addresses = i2c.scan()
finally:
    i2c.unlock()
print("I2C scan found:", [hex(a) for a in addresses] if addresses else "nothing")

lcd = GroveLCD(i2c)
print("Display responded.")

# Text test first, on its own - confirms the text controller works
# before the backlight cycle below (which also writes text every
# second, but this holds one message still long enough to actually read
# both 16-char lines and check for garbled/missing characters).
print("Writing test text - check both lines on the display.")
lcd.show_lines("Hello from NTK!", "LCD text test OK")
time.sleep(3)

print("Starting backlight color cycle. Ctrl-C to stop.")

COLORS = (
    ("red", (255, 0, 0)),
    ("green", (0, 255, 0)),
    ("blue", (0, 0, 255)),
    ("white", (255, 255, 255)),
    ("off", (0, 0, 0)),
)

while True:
    for name, rgb in COLORS:
        print(name)
        lcd.show_lines("Backlight test", "color: " + name)
        lcd.set_rgb(*rgb)
        time.sleep(1)
