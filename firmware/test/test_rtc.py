"""
Set the real-time clock to the current time, then read it back.

The clock here is the battery-backed PCF8563 chip on the Seeed XIAO
expansion board (I2C address 0x51, coin cell on the back) - the one that
keeps time with the power off. The ESP32-S3's own internal clock is NOT
battery-backed: it restarts from 2000-01-01 at every power-up.

"The current time" comes from an internet time server (NTP) over WiFi,
using the same NTK_WIFI_SSID / NTK_WIFI_PASSWORD keys in settings.toml
that the NTK firmware uses - so this needs a network with internet
access (not SoftAP mode). The chip is driven directly over I2C; no
extra library is needed.

Run it from the REPL (paste, or Thonny's Run). Run it again after
unplugging the board for a while with SET_CLOCK = False to check the
battery kept the time.
"""
import os
import struct
import time

import board
import socketpool
import wifi

# False = don't set anything, just read the clock chip back.
SET_CLOCK = True

# Hours ahead of UTC. Central European Time is 1 in winter, 2 in summer.
UTC_OFFSET_HOURS = 2

NTP_SERVER = "pool.ntp.org"
NTP_TO_UNIX = 2208988800  # seconds between 1900 (NTP's zero) and 1970 (Unix's)

PCF8563_ADDRESS = 0x51
REG_CONTROL_1 = 0x00
REG_SECONDS = 0x02  # then minutes, hours, day, weekday, month, year


def to_bcd(n):
    return ((n // 10) << 4) | (n % 10)


def from_bcd(b):
    return (b >> 4) * 10 + (b & 0x0F)


def write_clock(i2c, t):
    """t is a time.struct_time. The chip stores each field as two decimal
    digits (BCD) and only the last two digits of the year."""
    weekday = (t.tm_wday + 1) % 7  # struct_time: Monday=0; the chip: Sunday=0
    data = bytes([
        REG_SECONDS,
        to_bcd(t.tm_sec),  # top bit clear = "time is valid"
        to_bcd(t.tm_min),
        to_bcd(t.tm_hour),
        to_bcd(t.tm_mday),
        weekday,
        to_bcd(t.tm_mon),
        to_bcd(t.tm_year % 100),
    ])
    i2c.writeto(PCF8563_ADDRESS, bytes([REG_CONTROL_1, 0x00]))  # make sure the clock is running
    i2c.writeto(PCF8563_ADDRESS, data)


def read_clock(i2c):
    """Returns (text, valid). valid is False if the chip says it lost
    power since it was last set, so the time can't be trusted."""
    raw = bytearray(7)
    i2c.writeto_then_readfrom(PCF8563_ADDRESS, bytes([REG_SECONDS]), raw)
    valid = not (raw[0] & 0x80)
    text = "%04d-%02d-%02d %02d:%02d:%02d" % (
        2000 + from_bcd(raw[6]),
        from_bcd(raw[5] & 0x1F),
        from_bcd(raw[3] & 0x3F),
        from_bcd(raw[2] & 0x3F),
        from_bcd(raw[1] & 0x7F),
        from_bcd(raw[0] & 0x7F),
    )
    return text, valid


def network_time():
    """Seconds since 1970 (UTC) from an NTP server: a 48-byte request
    whose first byte says "client, NTP version 3"; the reply carries the
    time, in seconds, at bytes 40-43."""
    if not wifi.radio.connected:
        print("Joining WiFi...")
        wifi.radio.connect(os.getenv("NTK_WIFI_SSID"), os.getenv("NTK_WIFI_PASSWORD"))
    pool = socketpool.SocketPool(wifi.radio)
    # A few tries: the request is a single unacknowledged packet, so one
    # lost on the way simply never gets an answer.
    for attempt in range(4):
        packet = bytearray(48)
        packet[0] = 0x1B
        sock = pool.socket(pool.AF_INET, pool.SOCK_DGRAM)
        try:
            sock.settimeout(3)
            address = pool.getaddrinfo(NTP_SERVER, 123)[0][4]
            sock.sendto(packet, address)
            sock.recvfrom_into(packet)
            return struct.unpack("!I", packet[40:44])[0] - NTP_TO_UNIX
        except OSError as e:
            print("No answer from the time server (try %d): %s" % (attempt + 1, e))
        finally:
            sock.close()
    raise RuntimeError("Could not reach %s - is this network connected to the internet?" % NTP_SERVER)


i2c = board.I2C()
while not i2c.try_lock():
    pass
try:
    if PCF8563_ADDRESS not in i2c.scan():
        raise RuntimeError("No clock chip found at I2C address 0x51 - is the expansion board attached?")

    text, valid = read_clock(i2c)
    print("Clock before:", text, "" if valid else "(not trusted - the chip lost power since it was set)")

    if SET_CLOCK:
        now = time.localtime(network_time() + UTC_OFFSET_HOURS * 3600)
        write_clock(i2c, now)
        print("Clock set from %s (UTC%+d)" % (NTP_SERVER, UTC_OFFSET_HOURS))

    # Read it back a few times, to see it ticking.
    for _ in range(3):
        text, valid = read_clock(i2c)
        print("Clock now:   ", text, "" if valid else "(not trusted)")
        time.sleep(1)
finally:
    i2c.unlock()
