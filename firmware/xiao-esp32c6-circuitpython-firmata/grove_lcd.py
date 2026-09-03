"""
Minimal driver for the Grove - LCD RGB Backlight: a 16x2 character LCD
(JHD1313/AiP31068 text controller @ I2C address 0x3E) paired with an RGB
backlight driver chip (PCA9633 @ 0x62 on v1-v4 boards, or SGM31323 @ 0x30
on v5.0 - both expose the same register map, so this tries 0x62 then
0x30 and otherwise just skips backlight color).

There's no official Adafruit CircuitPython library for this display, so
this implements the handful of I2C writes it actually needs directly
rather than pulling in a dependency. Only used to show this board's IP
address at boot (see code.py) - not part of the Firmata protocol.
"""

import time

_LCD_ADDRESS = 0x3E
_RGB_ADDRESSES = (0x62, 0x30)

# I2C control bytes the JHD1313's AiP31068 controller expects as the
# first byte of every write - not to be confused with the HD44780
# command opcodes themselves, which follow as the second byte.
_CONTROL_COMMAND = 0x80
_CONTROL_DATA = 0x40

# Standard HD44780 command opcodes.
_CLEAR_DISPLAY = 0x01
_ENTRY_MODE_SET = 0x04 | 0x02  # left-to-right, no display shift
_DISPLAY_CONTROL = 0x08 | 0x04  # display on, cursor off, blink off
_FUNCTION_SET = 0x20 | 0x10 | 0x08  # 8-bit interface, 2-line, 5x8 dots
_SET_DDRAM_ADDRESS = 0x80

# PCA9633 register map (also valid as-is on the v5.0 SGM31323 backlight,
# which kept the same register interface for hardware compatibility).
_REG_MODE1 = 0x00
_REG_MODE2 = 0x01
_REG_BLUE = 0x02
_REG_GREEN = 0x03
_REG_RED = 0x04
_REG_LEDOUT = 0x08


class GroveLCD:
    """Raises (OSError, most likely) on construction if the display
    doesn't respond on the I2C bus - callers should wrap this in a
    try/except and just skip showing anything if there's no display
    attached (see code.py's show_ip_on_lcd)."""

    def __init__(self, i2c):
        self._i2c = i2c
        self._rgb_address = None

        while not i2c.try_lock():
            pass
        try:
            self._send_locked(_FUNCTION_SET)
            time.sleep(0.005)
            self._send_locked(_DISPLAY_CONTROL)
            self._send_locked(_CLEAR_DISPLAY)
            time.sleep(0.002)
            self._send_locked(_ENTRY_MODE_SET)

            for address in _RGB_ADDRESSES:
                try:
                    i2c.writeto(address, bytes([_REG_MODE1, 0x00]))
                    self._rgb_address = address
                    break
                except OSError:
                    continue

            if self._rgb_address is not None:
                i2c.writeto(self._rgb_address, bytes([_REG_MODE2, 0x00]))
                # All four PWM channels under direct register control.
                i2c.writeto(self._rgb_address, bytes([_REG_LEDOUT, 0xFF]))
        finally:
            i2c.unlock()

    def _send_locked(self, command):
        # Caller must already hold the I2C lock.
        self._i2c.writeto(_LCD_ADDRESS, bytes([_CONTROL_COMMAND, command]))

    def _write_char_locked(self, char):
        self._i2c.writeto(_LCD_ADDRESS, bytes([_CONTROL_DATA, ord(char)]))

    def show_lines(self, line1, line2=""):
        """Clear the display and show up to two 16-character lines."""
        while not self._i2c.try_lock():
            pass
        try:
            self._send_locked(_CLEAR_DISPLAY)
            time.sleep(0.002)

            self._send_locked(_SET_DDRAM_ADDRESS | 0x00)  # line 1, col 0
            for char in line1[:16]:
                self._write_char_locked(char)

            if line2:
                self._send_locked(_SET_DDRAM_ADDRESS | 0x40)  # line 2, col 0
                for char in line2[:16]:
                    self._write_char_locked(char)
        finally:
            self._i2c.unlock()

    def set_rgb(self, r, g, b):
        """No-op if no backlight driver responded during init (display
        still works, it just stays whatever color it powered on with)."""
        if self._rgb_address is None:
            return

        while not self._i2c.try_lock():
            pass
        try:
            self._i2c.writeto(self._rgb_address, bytes([_REG_RED, r]))
            self._i2c.writeto(self._rgb_address, bytes([_REG_GREEN, g]))
            self._i2c.writeto(self._rgb_address, bytes([_REG_BLUE, b]))
        finally:
            self._i2c.unlock()
