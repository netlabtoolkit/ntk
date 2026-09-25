"""
Optional SSD1306 OLED status display (128x64, I2C) - shows the board's
IP address, WiFi signal strength, and whether a client is currently
connected, plus one free-form debug line for whatever you're testing
right now (e.g. printing a Grove sensor's live reading while running
standalone, with no serial console needed to see it).

Shares the same board.I2C() bus pins.py's Grove sensors already use,
rather than bringing its own busio.I2C(scl=..., sda=...) like the
original test/boot-with-oled.py example did - so it coexists cleanly
with a Grove sensor plugged into the same connector, and there's no
board-specific pin wiring to get right here (works on any board where
board.I2C() is already correct, which is every board this project
supports - see pins.py's own module docstring).

Entirely optional: if no display responds at the expected I2C address,
every function below is a silent no-op - same graceful-skip convention
every Grove sensor probe in pins.py already uses. Safe to call whether
or not a display is actually attached.

HARDWARE CAVEAT, confirmed 2026-09-25: a directly-stacked OLED
expansion board can noticeably degrade this board's WiFi range/
reliability - the XIAO module's small onboard antenna sits close to
the expansion board's own PCB/ground plane and the OLED panel itself,
which detunes it. Measured on real hardware: repeated connect drops
(EPIPE/EAGAIN mid-session) and RSSI in the -75 to -90 range with the
expansion board attached, at a location/distance that was reliable
(single-digit ms ping, 0% loss) without it. This is a physical/RF
issue, not anything fixable in this module or elsewhere in the
firmware - not recommended as-is until either an external antenna is
added, or the OLED is wired via a cable/riser instead of direct
stacking, keeping the antenna area clear. A separate (non-stacking)
OLED module wired to board.I2C() via a normal Grove cable should not
have this problem at all, since it doesn't sit directly on the board.

Usage:
    import oled_display
    oled_display.init()  # once, after board.I2C() is safe to call
    oled_display.set_status(ip="192.168.0.145")       # code.py, once connected
    oled_display.set_status(connected=True)           # ntk_firmata_main.py, on client connect
    oled_display.set_status(rssi=-62)                 # either, whenever it's checked
    oled_display.set_debug("Temp: 21.3C  Hum: 45%")   # free-form - wire this into
                                                        # whatever you're actively testing
"""

_OLED_I2C_ADDRESS = 0x3C

_display = None
_ip_label = None
_status_label = None
_debug_label = None

# Tracked so set_status()'s individually-optional arguments (any left
# as None) can rebuild the one-line status text from whichever pieces
# are already known, without the caller having to pass all three every
# time - code.py knows the IP first, ntk_firmata_main.py learns
# connected state and RSSI independently, later.
_last_rssi = None
_last_connected = False


def init():
    """Call once, after board.I2C() is safe to use (i.e. not before
    WiFi is connected, same ordering constraint code.py's own module
    docstring documents for other large-module imports - displayio and
    friends are core/frozen modules though, not pure-Python like
    ntk_firmata_main.py, so the heap-fragmentation risk that docstring
    warns about doesn't apply here the same way; this is just about
    board.I2C() itself needing to exist).

    Returns True if a display was found and initialized, False
    otherwise (no display attached, or something else on the bus at
    this address)."""
    global _display, _ip_label, _status_label, _debug_label
    try:
        import board
        import displayio
        from i2cdisplaybus import I2CDisplayBus
        import adafruit_displayio_ssd1306
        import terminalio
        from adafruit_display_text import label

        displayio.release_displays()
        i2c = board.I2C()
        display_bus = I2CDisplayBus(i2c, device_address=_OLED_I2C_ADDRESS)
        _display = adafruit_displayio_ssd1306.SSD1306(display_bus, width=128, height=64)

        main_group = displayio.Group()
        # Explicit full-screen black fill FIRST, below the text labels -
        # without this, only the pixels the labels actually draw glyphs
        # onto get touched; anything left over in the SSD1306's own
        # framebuffer from a PREVIOUS program (this board's screen isn't
        # cleared on its own just because a new one started running) show
        # through as leftover junk around/behind the new text. Found
        # 2026-09-25 via hands-on testing - the display WAS initializing
        # correctly, this was purely a "never cleared the old pixels"
        # gap, not a detection/wiring problem.
        background_bitmap = displayio.Bitmap(128, 64, 1)
        background_palette = displayio.Palette(1)
        background_palette[0] = 0x000000
        background = displayio.TileGrid(background_bitmap, pixel_shader=background_palette)
        main_group.append(background)

        _ip_label = label.Label(terminalio.FONT, text="Connecting...", color=0xFFFFFF, x=0, y=6)
        _status_label = label.Label(terminalio.FONT, text="", color=0xFFFFFF, x=0, y=20)
        _debug_label = label.Label(terminalio.FONT, text="", color=0xFFFFFF, x=0, y=40)
        main_group.append(_ip_label)
        main_group.append(_status_label)
        main_group.append(_debug_label)
        _display.root_group = main_group
        return True
    except Exception as e:
        print("(OLED unavailable:", e, ")")
        _display = None
        return False


def set_status(ip=None, rssi=None, connected=None):
    """Any argument left as None keeps that piece's last-known value -
    see the module docstring for why (different callers learn each
    piece at different times)."""
    global _last_rssi, _last_connected
    if _display is None:
        return

    if ip is not None:
        _ip_label.text = "IP: %s" % ip

    if rssi is not None:
        _last_rssi = rssi
    if connected is not None:
        _last_connected = connected

    rssi_text = ("RSSI %d" % _last_rssi) if _last_rssi is not None else "RSSI --"
    conn_text = "Connected" if _last_connected else "Waiting"
    _status_label.text = "%s  %s" % (conn_text, rssi_text)
    _force_refresh()


def _force_refresh():
    # displayio's own background auto-refresh runs on a roughly-1s
    # cadence by default - fine for a value that stays put, but a
    # connect immediately followed by a near-instant disconnect (a bad
    # WiFi link producing an EPIPE/EAGAIN within a fraction of a
    # second, both hands-on-confirmed 2026-09-25) can set connected=True
    # then connected=False faster than that cadence ever gets a chance
    # to draw the intermediate state - the physical screen would just
    # jump straight from "Waiting" to "Waiting" with the "Connected"
    # frame never actually rendered, even though the code briefly set
    # it correctly. Matches this project's own stated principle (an
    # invisible state change reads as broken even when it's working) -
    # forcing a refresh on every update, not just leaving it to the
    # passive timer, makes even a momentary connect actually visible.
    # display.refresh() is safe to call even with auto_refresh still on
    # (its default) - this just adds an extra draw, not a conflicting one.
    try:
        _display.refresh()
    except Exception:
        pass


def set_debug(text):
    """Free-form single line (keep it short - 128px wide at this font
    is roughly 21 characters) for whatever you're actively testing -
    e.g. a Grove sensor's live reading while running standalone, with
    no serial console needed to watch it. Not tied to any specific
    sensor/widget on purpose - wire a call to this into wherever
    you're testing right now (a GroveSensor read function in pins.py,
    a step in standalone_interpreter.py's tick(), etc.) and remove it
    when done, same as a debug print() you'd delete afterward.

    Forces a refresh on every call, same reasoning as set_status() -
    but unlike connect/disconnect (rare events), this could be called
    from a moderate-rate loop (a sensor's own read interval). Each
    refresh is a real, blocking I2C write, so avoid calling this from
    anything faster than roughly once a second or so (matches typical
    Grove sensor min_interval_ms values already in pins.py) - a
    genuinely per-tick call here would measurably slow the interpreter
    down, the same class of problem this project's other timing-
    sensitive fixes (Grove sensor polling, Cloud's MQTT poll gating)
    already exist to avoid."""
    if _display is None:
        return
    _debug_label.text = text
    _force_refresh()
