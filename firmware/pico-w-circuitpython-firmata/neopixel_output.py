"""
NeoPixel/WS2812(RGBW) addressable-strip output, driven entirely
device-side - see the NTK client's NeoPixel widget (app/scripts/views/
NeoPixel/NeoPixel.js) for why: a WiFi round trip per animation frame
would look stuttery for chase/sparkle/rainbow, so the widget only sends
a new NEOPIXEL_REQUEST (see firmata_server.py) when a PARAMETER
changes (mode/speed/color/pixel count/format), and this module free-
runs the actual pattern off time.monotonic() every main-loop iteration
(see tick(), called from ntk_firmata_main.py's run_server() loop),
independent of whether any new message has arrived recently. "vu" mode
is the one exception - inherently input-driven, so the widget streams
it as a `level` field in the same config message instead (throttled
client-side, not here - see _handle_neopixel_request's own comment in
ntk_firmata_main.py).

Usage (from ntk_firmata_main.py - see _handle_neopixel_request/the main
loop for the full call sites):
    neopixel_output.set_config(firmata, config)  # on NEOPIXEL_REQUEST
    neopixel_output.tick(firmata)                 # every loop iteration

config dict shape (all keys always present - the widget sends its
whole config wholesale, not a partial diff):
    pin: int (Firmata pin index - see pins.py's PIN_TABLE)
    numPixels: int
    bpp: int (3 = RGB, 4 = RGBW)
    mode: "full" | "chase" | "sparkle" | "rainbow" | "vu"
    speed: int (0-100 widget scale)
    color: [r, g, b] or [r, g, b, w] (0-255 each)
    brightness: float (0.0-1.0 - widget's own 0-100 already divided
        down before this reaches the wire)
    level: int (0-1023, "vu" mode only - NTK's standard inlet range)
"""

import time

_strip = None  # live neopixel.NeoPixel object, or None if never configured
_pin = None  # the firmata _Pin wrapper currently claimed - tracked so a
             # pin/count/format change can release the OLD one before
             # claiming whatever the NEW config asks for
_config = {}
_last_tick = 0.0

# Device-side pixel push rate cap - independent of "speed" (which
# controls how fast a PATTERN moves, not how often the strip is
# physically rewritten). 30/sec is smooth to the eye and well within
# what bit-banged neopixel_write can do without measurably slowing the
# rest of the per-connection loop down - same "don't drive a blocking
# hardware write every single tick" caution oled_display.py's
# _force_refresh already documents for I2C.
_MIN_TICK_INTERVAL_S = 1.0 / 30


def set_config(firmata, config):
    """Reconstructs the live neopixel.NeoPixel object only when pin/
    numPixels/bpp actually change (the three that require a new
    object) - mode/speed/color/brightness/level are just cached here
    and picked up on the next tick()."""
    global _strip, _pin, _config

    pin_index = config.get("pin")
    num_pixels = max(1, int(config.get("numPixels", 1)))
    bpp = 4 if config.get("bpp") == 4 else 3

    needs_rebuild = (
        _strip is None
        or _config.get("pin") != pin_index
        or _config.get("numPixels") != num_pixels
        or _config.get("bpp") != bpp
    )

    _config = dict(config)
    _config["numPixels"] = num_pixels
    _config["bpp"] = bpp

    if not needs_rebuild:
        return

    _teardown()

    if pin_index is None or not (0 <= pin_index < len(firmata.pins)):
        print("NeoPixel: invalid pin index", pin_index)
        return

    pin = firmata.pins[pin_index]
    if pin.board_pin is None:
        print("NeoPixel: pin", pin_index, "has no real board pin")
        return

    # Every pin starts claimed as a digital output driven low (see
    # firmata_server.py's _drive_unclaimed_pins_low) - release that
    # (or whatever a previous widget left it as) before claiming it
    # for the strip, same as _apply_pin_mode already does for every
    # other pin-mode change.
    firmata._release_pin_io(pin)
    try:
        import neopixel
        strip = neopixel.NeoPixel(pin.board_pin, num_pixels, bpp=bpp, auto_write=False)
    except Exception as e:
        print("NeoPixel: init failed:", e)
        return

    # Stored as this pin's io object (not anything NeoPixel-specific in
    # _Pin itself) so release_all_pins()/_release_pin_io() deinit it on
    # disconnect/reconfigure exactly like any other pin owner, with no
    # special-casing needed there - NeoPixel.deinit() exists for this.
    pin.io = strip
    _strip = strip
    _pin = pin


def _teardown():
    global _strip, _pin
    if _pin is not None and _pin.io is not None:
        try:
            _pin.io.deinit()
        except Exception:
            pass
        _pin.io = None
    _strip = None
    _pin = None


def release():
    """Call when a connection ends (alongside firmata.release_all_pins())
    so a dropped connection doesn't leave the strip frozen on its last
    frame - mirrors release_all_pins()'s own "fresh FirmataServer per
    connection" reasoning.

    Writes one all-off frame before tearing down, deliberately NOT
    folded into _teardown() itself (set_config() also calls that, on
    every pin/numPixels/bpp change, which must stay a silent rebuild -
    flashing the strip off on every routine reconfigure would be its
    own new bug). Hardware-verified gap, 2026-10-01: without this, a
    standalone pattern cut off mid-animation by run_server()'s handoff
    (release_hardware(), called right after accept()s a new client -
    see its own comment) left the strip holding whatever raw color
    data was last shifted into it, for however long the new live
    connection then took to send its own first real config - read on
    the strip as "flashes randomly, then settles" rather than a clean
    off-then-on."""
    if _strip is not None:
        try:
            _strip.fill((0, 0, 0, 0) if _strip.bpp == 4 else (0, 0, 0))
            _strip.show()
        except Exception:
            pass
    _teardown()
    global _config
    _config = {}


def tick(firmata):
    """Call once per main-loop iteration - cheap no-op when nothing's
    configured yet, self-throttled to _MIN_TICK_INTERVAL_S otherwise."""
    global _last_tick
    if _strip is None:
        return
    now = time.monotonic()
    if now - _last_tick < _MIN_TICK_INTERVAL_S:
        return
    _last_tick = now

    brightness = _config.get("brightness")
    if brightness is not None and _strip.brightness != brightness:
        _strip.brightness = brightness

    mode = _config.get("mode", "full")
    func = _MODE_FUNCS.get(mode, _mode_full)
    try:
        func(now)
        _strip.show()
    except Exception as e:
        print("NeoPixel: pattern error:", e)


def _off_color():
    return (0, 0, 0, 0) if _strip.bpp == 4 else (0, 0, 0)


def _get_color():
    c = _config.get("color") or (0, 0, 0, 0)
    if _strip.bpp == 4:
        return (c[0], c[1], c[2], c[3] if len(c) > 3 else 0)
    return (c[0], c[1], c[2])


def _speed_to_period_s(speed):
    """speed: 0-100 widget scale -> seconds per full cycle (one chase
    lap, one rainbow revolution). Deliberately inverted (higher speed =
    shorter period) and clamped well away from 0 - a speed of 0 would
    otherwise mean "never move" via a divide-by-zero, not "stopped but
    still a valid period." Range (0.3s very fast .. 6s very slow) isn't
    from any spec - just what looked right against the hands-on D7
    spike's strip."""
    speed = max(1, min(100, int(speed or 1)))
    return 6.0 - (speed - 1) * (5.7 / 99)


_phase = 0.0  # 0.0-1.0, shared by chase/rainbow (mutually exclusive
              # modes, so sharing one accumulator is harmless) - how
              # far through one lap/revolution we currently are.
_phase_last_now = None


def _advance_phase(now, period):
    """Advances _phase by (time since the last tick / period),
    wrapping at 1.0 - continuous regardless of period changing between
    calls, unlike computing position directly from `now % period`
    (the original approach here), which jumps to a basically unrelated
    value the instant period changes even slightly, because the same
    large, ever-increasing `now` lands somewhere totally different
    modulo a different period. Hardware-verified 2026-10-01: varying
    speed live (including from a noisy/jittering AnalogIn, not just a
    deliberate knob turn - period changes a little on nearly every
    tick either way) made chase's lit pixel jump all over the strip.
    Changing speed now only changes how fast phase moves FROM HERE,
    never where it currently is."""
    global _phase, _phase_last_now
    if _phase_last_now is not None and period > 0:
        _phase = (_phase + (now - _phase_last_now) / period) % 1.0
    _phase_last_now = now
    return _phase


def _mode_full(now):
    _strip.fill(_get_color())


def _mode_chase(now):
    n = len(_strip)
    period = _speed_to_period_s(_config.get("speed", 50))
    pos = int(_advance_phase(now, period) * n)
    color = _get_color()
    off = _off_color()
    for i in range(n):
        _strip[i] = color if i == pos else off


def _mode_sparkle(now):
    import random
    n = len(_strip)
    # Re-roll which pixels are lit at a rate derived from speed, not
    # every tick - every tick would look like noise, not sparkle.
    # Reseed deterministically from a time-derived "window index"
    # rather than held state - simplest way to get "a new random
    # pattern every window" using only time, no extra tracking
    # variables to reset on reconfigure.
    period = _speed_to_period_s(_config.get("speed", 50)) / 4
    random.seed(int(now / period))
    color = _get_color()
    off = _off_color()
    for i in range(n):
        _strip[i] = color if random.random() < 0.3 else off


def _colorwheel(pos):
    # CircuitPython builds without the native rainbowio module fall
    # back to this - same pure-Python colorwheel() the
    # circuitpython-tricks doc this widget is based on documents.
    pos = pos & 0xFF
    if pos < 85:
        return (255 - pos * 3, pos * 3, 0)
    if pos < 170:
        pos -= 85
        return (0, 255 - pos * 3, pos * 3)
    pos -= 170
    return (pos * 3, 0, 255 - pos * 3)


def _mode_rainbow(now):
    # rainbowio.colorwheel() (the native version) returns a packed
    # 24-bit int (0xRRGGBB) - that's why "pixels.fill(colorwheel(hue))"
    # is the usual one-liner in CircuitPython examples, .fill() accepts
    # that directly. _colorwheel() above (the no-rainbowio fallback)
    # returns an (r, g, b) tuple instead, matching the circuitpython-
    # tricks doc's own pure-Python version. Unpacking a packed int as
    # if it were a tuple (`r, g, b = colorwheel(hue)`) raises a
    # TypeError, caught by tick()'s own exception handler - silently
    # aborting before _strip.show() ever runs, so the strip just never
    # updates. Real bug, hardware-verified 2026-10-01 (rainbow mode did
    # nothing at all on this board's rainbowio, while the browser
    # preview - separate, hand-written JS that already returns a
    # tuple-shaped value - looked fine, which is what made this one
    # confusing to spot). Branch on which shape is actually in use
    # instead of assuming either one.
    try:
        from rainbowio import colorwheel
        native = True
    except ImportError:
        colorwheel = _colorwheel
        native = False

    n = len(_strip)
    period = _speed_to_period_s(_config.get("speed", 50))
    offset = _advance_phase(now, period) * 255
    has_white = _strip.bpp == 4
    for i in range(n):
        hue = int(offset + i * (255 / n)) & 0xFF
        if native:
            packed = colorwheel(hue)
            r, g, b = (packed >> 16) & 0xFF, (packed >> 8) & 0xFF, packed & 0xFF
        else:
            r, g, b = colorwheel(hue)
        _strip[i] = (r, g, b, 0) if has_white else (r, g, b)


def _mode_vu(now):
    n = len(_strip)
    # Matches NTK's standard 0-1023 widget value range (see
    # models/WidgetConfig.js's inputCeiling/outputCeiling defaults) -
    # the widget sends its "in" inlet's raw value, not pre-scaled.
    level = max(0, min(1023, _config.get("level", 0)))
    lit = round(n * (level / 1023.0))
    color = _get_color()
    off = _off_color()
    for i in range(n):
        _strip[i] = color if i < lit else off


_MODE_FUNCS = {
    "full": _mode_full,
    "chase": _mode_chase,
    "sparkle": _mode_sparkle,
    "rainbow": _mode_rainbow,
    "vu": _mode_vu,
}
