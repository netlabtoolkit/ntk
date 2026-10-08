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


_PERIOD_MAX_S = 6.0  # speed=1, slowest
_PERIOD_MIN_S = 0.3  # speed=100, fastest


def _speed_to_period_s(speed):
    """speed: 0-100 widget scale -> seconds per full cycle (one chase
    lap, one rainbow revolution). Deliberately inverted (higher speed =
    shorter period). Range (0.3s very fast .. 6s very slow) isn't
    from any spec - just what looked right against the hands-on D7
    spike's strip.

    A speed of 0 (or below) means STOPPED and returns a period of 0 -
    not a real period, a sentinel every caller has to check for rather
    than divide by: _advance_phase() already leaves the phase where it
    is for a non-positive period (chase/rainbow freeze in place), and
    _mode_sparkle holds its current pattern.

    Geometric (log-spaced), not linear, between the two endpoints -
    found 2026-10-01: perceived speed tracks roughly 1/period (how
    many laps per second), not period itself, so interpolating period
    LINEARLY makes 1/period change slowly across most of the slider
    and then shoot up right at the end - nearly all the perceptible
    variation was concentrated in one part of the 0-100 range instead
    of spread across it. A geometric interpolation keeps the RATIO
    between consecutive speed steps constant instead, which is the
    same reason audio pitch/playback-speed controls are log-scaled
    rather than linear."""
    speed = min(100, int(speed or 0))
    if speed <= 0:
        return 0.0
    t = (speed - 1) / 99.0  # 0.0 .. 1.0
    return _PERIOD_MAX_S * ((_PERIOD_MIN_S / _PERIOD_MAX_S) ** t)


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


def _scale_color(color, factor):
    """Each channel of color scaled by factor (0.0-1.0), rounded to
    the nearest int - used by _mode_chase below to blend brightness
    between two adjacent pixels instead of jumping the lit pixel
    between them at full brightness each."""
    return tuple(int(round(c * factor)) for c in color)


_CHASE_TAIL_LENGTH = 4  # pixels behind the head that still show some light
_CHASE_TAIL_DECAY = 0.6  # each pixel further back is this fraction as bright as the last
_CHASE_AHEAD_GLOW = 0.15  # slight motion-blur glow on the single pixel just ahead of the head
# The factors above are PERCEIVED brightness steps (they're shared
# as-is with NeoPixel.js's browser preview, where scaling an sRGB
# value linearly already looks roughly proportional). A real LED's
# light output is linear in the value written, and the eye isn't -
# written straight to the strip, 0.8 of full is barely
# distinguishable from full and even the last tail pixel (0.8**4 =
# 0.41) still reads as most of the way there. Hardware-observed
# 2026-10-03: "the trailing pixels are the same brightness as the
# leading pixel." Raising each factor to this gamma before scaling
# turns it into the linear drive level that actually looks like that
# fraction (0.6 -> 0.33, 0.6**4 = 0.13 -> 0.01).
_CHASE_GAMMA = 2.2


def _chase_scale(color, factor):
    return _scale_color(color, factor ** _CHASE_GAMMA)


def _mode_chase(now):
    # Meteor/comet tail: the head (current pixel) is always at full
    # brightness, with a multi-pixel trail decaying behind it (each
    # step _CHASE_TAIL_DECAY as bright as the last, out to
    # _CHASE_TAIL_LENGTH pixels) and a slight glow on the one pixel
    # just ahead (motion blur) - this is what actually reads as an
    # "organic, fluid" chase, not sub-pixel blending between two
    # pixels (tried first, looked like the head itself fading in/out
    # rather than a trailing glow).
    n = len(_strip)
    period = _speed_to_period_s(_config.get("speed", 50))
    pos = int(_advance_phase(now, period) * n)
    color = _get_color()
    off = _off_color()
    ahead = (pos + 1) % n
    for i in range(n):
        if i == pos:
            _strip[i] = color
        elif i == ahead:
            _strip[i] = _chase_scale(color, _CHASE_AHEAD_GLOW)
        else:
            behind = (pos - i) % n
            if behind <= _CHASE_TAIL_LENGTH:
                _strip[i] = _chase_scale(color, _CHASE_TAIL_DECAY ** behind)
            else:
                _strip[i] = off


_SPARKLE_DENSITY = 0.3  # fraction of pixels lit in any one pattern
_sparkle_window = None  # window index the current pattern was rolled for
_sparkle_lit = []  # one bool per pixel - the current pattern


def _mode_sparkle(now):
    global _sparkle_window, _sparkle_lit
    import random
    n = len(_strip)
    # Re-roll which pixels are lit at a rate derived from speed, not
    # every tick - every tick would look like noise, not sparkle. The
    # pattern is rolled once per time "window" and kept in
    # _sparkle_lit until the window index changes; at speed 0
    # (stopped, period 0) the index simply never changes, so the
    # current pattern is held.
    #
    # This used to call random.seed(window index) every tick and draw
    # the pattern fresh from that - no state to keep, but consecutive
    # small integer seeds put CircuitPython's generator in nearly the
    # same starting state each time, so the first draws after seeding
    # barely vary from one window to the next and the pixels they
    # decide come out the same every pattern. Hardware-observed
    # 2026-10-03: "sparkle never seems to light up pixel 1." Drawing
    # from the free-running generator instead (never reseeded) gives
    # every pixel the same odds.
    period = _speed_to_period_s(_config.get("speed", 50)) / 4
    window = int(now / period) if period > 0 else _sparkle_window
    if window != _sparkle_window or len(_sparkle_lit) != n:
        _sparkle_window = window
        _sparkle_lit = [random.random() < _SPARKLE_DENSITY for _ in range(n)]
    color = _get_color()
    off = _off_color()
    for i in range(n):
        _strip[i] = color if _sparkle_lit[i] else off


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
