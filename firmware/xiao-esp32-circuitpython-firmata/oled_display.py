"""
Optional SSD1306 OLED status display (128x64, I2C), 6 lines total:

    1. mDNS hostname, e.g. "ntk-device.local" - blank if mDNS is
       disabled (NTK_MDNS_HOSTNAME = "none") or unavailable, never the
       unresolved candidate name if the collision check in code.py
       renamed it (see set_status()'s own hostname= doc).
    2. IP address - prefixed "AP " in SoftAP mode ("AP 192.168.4.1"),
       when the board is running its own network (see code.py)
    3. WiFi signal strength, then device mode: "RSSI -61, controlled"
       (mode is one of "connecting...", "waiting...", "controlled",
       "standalone", or "monitored" - see set_mode()) - combining IP+RSSI
       on one line instead (an earlier layout) ran too long and got
       clipped on real hardware, found 2026-09-28.
    4-6. Whatever the Display widget's three inlets are showing (see
       set_lines()) - blank until a patch actually has a Display widget
       wired to hardware.

    Lines are y=6,16,25,34,43,52 (10px between lines 1-2, 9px between
    every other consecutive pair - widened the first gap specifically
    per the user's own hands-on feedback 2026-10-02 on the real
    screen) rather than the original 5-line layout's uniform 12px, to
    fit a 6th line in the same 64px-tall panel while still leaving a
    few px of margin below the last line's glyphs (52+8=60, vs the
    panel's 64) - added 2026-10-02 for the hostname line above; the
    original 12px spacing left only 2px of margin with 5 lines and
    wouldn't fit a 6th without this change.
    A since-reverted attempt to start at y=2 instead of y=6 (to buy an
    extra 1px of gap per line) clipped the top line's glyphs on real
    hardware - Label's y is the text BASELINE, not its top-left corner,
    so glyphs extend ABOVE y by some amount (the font's ascent); y=6
    was far enough from the top edge (0) to absorb that, y=2 wasn't.
    y=6 is confirmed safe (it was the original 5-line layout's own
    first-line position, with no clipping ever reported there) - don't
    push this above 6 without actually checking terminalio.FONT's
    ascent/descent metrics first, not just guessing at another value.

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

Single-display only, deliberately - see [[display_widget_spec]] memory
for the multi-OLED question (technically possible via the SSD1306's
alternate-address jumper or a second I2C bus, explicitly deferred).

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

Confirmed 2026-09-27: a XIAO ESP32-S3 with the external-antenna variant
works well with the same stacking OLED expansion board - no detuning,
since the antenna itself isn't the onboard trace antenna this caveat is
about. The issue is specific to boards relying on the small onboard
antenna (like the plain XIAO ESP32-C6).

Usage:
    import oled_display
    oled_display.init()  # once, after board.I2C() is safe to call
    oled_display.set_status(ip="192.168.0.145")  # code.py, once connected
    oled_display.set_status(rssi=-62)            # either, whenever it's checked
    oled_display.set_status(hostname="ntk-device.local")  # code.py, once
                                                   # mDNS is confirmed active
    oled_display.set_mode("waiting")             # ntk_firmata_main.py/code.py,
                                                   # on every mode transition
    oled_display.set_lines(["Temp: 21.3C", "", ""])  # Display widget's 3 lines,
                                                        # via firmata_server.py's
                                                        # DISPLAY_TEXT_REQUEST handling
"""

_OLED_I2C_ADDRESS = 0x3C

_display = None
_hostname_label = None  # line 1: mDNS hostname (blank if none)
_status_label = None    # line 2: IP
_mode_label = None      # line 3: device mode + RSSI
_line_labels = None     # lines 4-6: Display widget's three lines

# Tracked so a change to either piece (mode or RSSI - set independently,
# at different times, by different callers) can rebuild line 2's
# combined text without the caller having to already know the other one.
_last_mode = None
_last_rssi = None

# Valid set_mode() values, in the order they're documented above -
# purely for a friendlier fallback if something passes a typo/unknown
# value (printed once to the console, not silently swallowed) rather
# than a strict enum this small firmware needs to import for.
_KNOWN_MODES = ("connecting", "waiting", "controlled", "standalone", "monitored")


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
    global _display, _hostname_label, _status_label, _mode_label, _line_labels
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

        # 6 lines across the 64px-tall panel - 10px between lines 1-2
        # (widened from 9px per the user's own hands-on feedback
        # 2026-10-02 looking at the real screen), 9px between every
        # other consecutive pair. terminalio.FONT's glyphs are 8px
        # tall, so even the tighter 9px gaps leave a small visible gap
        # between lines, without crowding the last one off the bottom
        # edge: 52 + 8 = 60, inside 64 with 4px to spare. y=6 for the
        # first line (not lower) is deliberate - see module docstring
        # for a reverted attempt at y=2 that clipped this line's
        # glyphs.
        _hostname_label = label.Label(terminalio.FONT, text="", color=0xFFFFFF, x=0, y=6)
        # Starts blank, not "Connecting..." - the mode line right below
        # already shows that (set_mode("connecting"), called right
        # after init() in code.py), and having both say essentially the
        # same thing on two different lines read as redundant/confusing
        # on real hardware - this line's whole purpose is the IP once
        # it's actually known, so there's nothing useful to show here
        # before then.
        _status_label = label.Label(terminalio.FONT, text="", color=0xFFFFFF, x=0, y=16)
        _mode_label = label.Label(terminalio.FONT, text="", color=0xFFFFFF, x=0, y=25)
        _line_labels = [
            label.Label(terminalio.FONT, text="", color=0xFFFFFF, x=0, y=34),
            label.Label(terminalio.FONT, text="", color=0xFFFFFF, x=0, y=43),
            label.Label(terminalio.FONT, text="", color=0xFFFFFF, x=0, y=52),
        ]
        main_group.append(_hostname_label)
        main_group.append(_status_label)
        main_group.append(_mode_label)
        for line_label in _line_labels:
            main_group.append(line_label)
        _display.root_group = main_group
        return True
    except Exception as e:
        print("(OLED unavailable:", e, ")")
        _display = None
        return False


def set_status(ip=None, rssi=None, hostname=None):
    """ip goes straight onto line 2 - it's only ever set once, when
    code.py first learns it, so there's no "keep the last-known value"
    case to handle there (unlike rssi/mode on line 3, set independently
    of each other - see _rebuild_mode_line()). hostname is the same:
    set once, straight onto line 1 - pass the already-resolved name
    (post collision-check rename, if any - see code.py's own
    _resolve_mdns_hostname()), with ".local" included, or pass "" (not
    None - None here means "no new value to apply", same as every
    other kwarg in this function) if mDNS is disabled/unavailable so
    the line stays blank rather than showing a stale/wrong value."""
    global _last_rssi
    if _display is None:
        return

    if ip is not None:
        _status_label.text = ip
    if hostname is not None:
        _hostname_label.text = hostname
    if rssi is not None:
        _last_rssi = rssi
        _rebuild_mode_line()
    _force_refresh()


def set_mode(mode):
    """One of "connecting", "waiting", "controlled", "standalone", or
    "monitored" - see the module docstring's line-2 description and
    [[display_widget_spec]] memory for exactly which call site in
    code.py/ntk_firmata_main.py uses which value and why."""
    global _last_mode
    if _display is None:
        return
    if mode not in _KNOWN_MODES:
        print("oled_display.set_mode: unknown mode", repr(mode))
    _last_mode = mode
    _rebuild_mode_line()
    _force_refresh()


def _rebuild_mode_line():
    # RSSI and mode are set independently (a WiFi signal check vs. a
    # connect/disconnect/monitor transition, at unrelated times) - both
    # land on line 2 together, so either one changing has to redraw the
    # whole line from whatever the other piece's last-known value was.
    rssi_text = ("RSSI %d, " % _last_rssi) if _last_rssi is not None else ""
    mode_text = _last_mode if _last_mode is not None else ""
    _mode_label.text = "%s%s" % (rssi_text, mode_text)


def set_lines(lines):
    """Lines 3-5: up to three strings (the Display widget's composed
    inlet text, prepend+value+append per line - see DISPLAY_TEXT_REQUEST
    in firmata_server.py). Fewer than three clears the remaining ones;
    extras beyond three are ignored rather than raising, since a widget
    could in principle send a differently-sized list during development
    without crashing the display."""
    if _display is None:
        return
    for i, line_label in enumerate(_line_labels):
        line_label.text = lines[i] if i < len(lines) else ""
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
    #
    # Each refresh is a real, blocking I2C write - set_lines() in
    # particular could in principle be called from a moderate-rate
    # context (a widget's inlet updating often), so callers should
    # avoid driving it faster than roughly once a second or so, same
    # caution the old set_debug() documented (matches typical Grove
    # sensor min_interval_ms values already in pins.py) - a genuinely
    # per-tick call here would measurably slow the interpreter down,
    # the same class of problem this project's other timing-sensitive
    # fixes (Grove sensor polling, Cloud's MQTT poll gating) already
    # exist to avoid. Not rate-limited inside this module itself -
    # callers (firmata_server.py's dispatch, standalone_interpreter.py's
    # tick) are responsible for their own gating, same as everywhere
    # else timing-sensitive in this firmware.
    try:
        _display.refresh()
    except Exception:
        pass
