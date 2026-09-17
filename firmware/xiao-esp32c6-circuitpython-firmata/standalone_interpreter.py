"""
standalone_interpreter.py - v1 on-device patch interpreter.

See plans/standalone-patch-export.md ("Recommended architecture: on-device
generic interpreter"). Reads a JSON-serialized NTK patch (the exact same
{widgets: [...], mappings: [...]} shape the desktop app's "Export
Standalone" button downloads as standalone_patch.json) and evaluates its
portable widgets every loop tick, driving real GPIO through the SAME pin
abstraction firmata_server.py uses - FirmataServer's own _Pin/
_apply_pin_mode/_handle_analog_write/_handle_report_analog methods,
reused directly rather than reimplemented, since that layer is already
hardware-verified (see recent commits fixing Servo order-dependence and
firmware backpressure). No Firmata wire protocol is involved - the
interpreter runs on the SAME board that would otherwise be "the
hardware", so it skips the wire entirely for local pins.

Portable widget set - MUST be kept in sync by hand with
app/scripts/utils/StandaloneCompatibility.js's PORTABLE_TYPE_IDS; there's
no shared source between JS and Python:
    AnalogIn, AnalogOut, DigitalIn, DigitalOut, Servo, IfThen, Boolean,
    Gate, Mix, Splitter, Process, Count, Concat, Pulse, Sequence, Tween,
    Data
NOT yet implemented here despite being in the JS checker's PORTABLE_TYPE_IDS:
GroveSensor. Its sysex-based sensor catalog (subscribe/unsubscribe,
per-sensor read functions in pins.py's GROVE_SENSOR_CATALOG) is a
separate, more involved integration than the plain Firmata pin scheme
every other hardware widget uses - deferred as a build-order gap, not a
fundamental blocker the way Gesture/DTW is. UNSUPPORTED_TYPE_IDS below
is exactly PORTABLE_TYPE_IDS minus GroveSensor, and load() rejects
anything outside it the same way the JS checker does - clearly, not
silently.

Known, deliberate simplifications vs. the real widget JS (each widget's
own section below has the detail):
- IfThen's wait-time hysteresis is JS setTimeout-driven (fires
  independently of any polling loop); ported here as tick-polled elapsed-
  time checks instead. At this interpreter's tick rate (hundreds of Hz,
  see the 2026-09-17 performance spike in the plan doc) this settles
  within roughly a tick of the same wall-clock deadline - not exact
  setTimeout-firing semantics, but behaviorally equivalent for real
  hardware timing.
- Tween's easing curves are ported from
  ~/Documents/GitHub/VarSpeedPython/varspeed/easing_functions.py (the
  same Penner-equation source Tween.js's own code comment cites for the
  curves Velocity.js can't bezier-approximate) - a faithful port, not a
  guess, but Velocity's Quad/Cubic/etc. are themselves bezier
  *approximations* of these closed-form equations, so there's a small
  inherent difference from Velocity's exact curve.
- Sequence's per-segment tweening uses linear interpolation instead of
  replicating Velocity's default "swing" easing - Sequence never exposed
  an easing choice to the user (unlike Tween, where it's a first-class
  field), so exact curve fidelity matters far less here.
"""

import json
import time

import firmata_server


PORTABLE_TYPE_IDS = frozenset([
    'AnalogIn', 'AnalogOut', 'DigitalIn', 'DigitalOut', 'Servo',
    'IfThen', 'Boolean', 'Gate', 'Mix', 'Splitter', 'Process', 'Count',
    'Concat', 'Pulse', 'Sequence', 'Tween', 'Data',
])

HARDWARE_INPUT_TYPES = frozenset(['AnalogIn', 'DigitalIn'])
HARDWARE_OUTPUT_TYPES = frozenset(['AnalogOut', 'DigitalOut', 'Servo'])

# Chain-driven types: their real output comes from piping outs[].from
# through a per-type list of signal-chain functions into outs[].to -
# exactly WidgetMulti.js's processSignalChain()/signalChainFunctions
# mechanism, ported generically instead of one-off per type.
CHAIN_TYPES = frozenset(['AnalogIn', 'DigitalIn', 'AnalogOut', 'DigitalOut', 'Servo', 'Process', 'IfThen'])


def _num(v, default=None):
    """parseFloat-alike: NaN (not an exception) for anything non-numeric
    when no default is given, matching JS's parseFloat('-') /
    parseFloat(undefined) behavior that several widgets' own isNaN()
    guards rely on (Boolean/Mix/Count's unconnected '-' inlets in
    particular). Pass an explicit default only for config fields that
    have a real fallback value (thresholds, ranges, etc.) - never for a
    raw inlet value a widget is supposed to treat as "not connected"."""
    try:
        return float(v)
    except (TypeError, ValueError):
        return float('nan') if default is None else default


def _nan():
    return float('nan')


def _is_nan(v):
    return v != v  # IEEE-754 trick: NaN is the only value not equal to itself


# ==================== easing (Tween) ====================
# Ported from ~/Documents/GitHub/VarSpeedPython/varspeed/easing_functions.py
# - the same source Tween.js's own comment cites for the curves Velocity
# can't bezier-approximate (Elastic/Back/Bounce). Function-style here
# instead of that file's EasingBase subclasses - this interpreter has no
# use for its start/end/duration wrapper, just the 0..1 -> 0..1 shape.
import math as _math


def _ease_quad_in(t): return t * t
def _ease_quad_out(t): return -(t * (t - 2))
def _ease_quad_in_out(t): return 2 * t * t if t < 0.5 else (-2 * t * t) + (4 * t) - 1

def _ease_cubic_in(t): return t * t * t
def _ease_cubic_out(t): return (t - 1) ** 3 + 1
def _ease_cubic_in_out(t):
    if t < 0.5:
        return 4 * t * t * t
    p = 2 * t - 2
    return 0.5 * p * p * p + 1

def _ease_quart_in(t): return t ** 4
def _ease_quart_out(t): return (t - 1) ** 3 * (1 - t) + 1
def _ease_quart_in_out(t):
    if t < 0.5:
        return 8 * t ** 4
    p = t - 1
    return -8 * p ** 4 + 1

def _ease_quint_in(t): return t ** 5
def _ease_quint_out(t): return (t - 1) ** 5 + 1
def _ease_quint_in_out(t):
    if t < 0.5:
        return 16 * t ** 5
    p = (2 * t) - 2
    return 0.5 * p ** 5 + 1

def _ease_sine_in(t): return _math.sin((t - 1) * _math.pi / 2) + 1
def _ease_sine_out(t): return _math.sin(t * _math.pi / 2)
def _ease_sine_in_out(t): return 0.5 * (1 - _math.cos(t * _math.pi))

def _ease_circ_in(t): return 1 - _math.sqrt(1 - (t * t))
def _ease_circ_out(t): return _math.sqrt((2 - t) * t)
def _ease_circ_in_out(t):
    if t < 0.5:
        return 0.5 * (1 - _math.sqrt(1 - 4 * (t * t)))
    return 0.5 * (_math.sqrt(-((2 * t) - 3) * ((2 * t) - 1)) + 1)

def _ease_expo_in(t): return 0 if t == 0 else _math.pow(2, 10 * (t - 1))
def _ease_expo_out(t): return 1 if t == 1 else 1 - _math.pow(2, -10 * t)
def _ease_expo_in_out(t):
    if t == 0 or t == 1:
        return t
    if t < 0.5:
        return 0.5 * _math.pow(2, (20 * t) - 10)
    return -0.5 * _math.pow(2, (-20 * t) + 10) + 1

def _ease_elastic_in(t): return _math.sin(13 * _math.pi / 2 * t) * _math.pow(2, 10 * (t - 1))
def _ease_elastic_out(t): return _math.sin(-13 * _math.pi / 2 * (t + 1)) * _math.pow(2, -10 * t) + 1
def _ease_elastic_in_out(t):
    if t < 0.5:
        return 0.5 * _math.sin(13 * _math.pi / 2 * (2 * t)) * _math.pow(2, 10 * ((2 * t) - 1))
    return 0.5 * (_math.sin(-13 * _math.pi / 2 * ((2 * t - 1) + 1)) * _math.pow(2, -10 * (2 * t - 1)) + 2)

def _ease_back_in(t): return t * t * t - t * _math.sin(t * _math.pi)
def _ease_back_out(t):
    p = 1 - t
    return 1 - (p * p * p - p * _math.sin(p * _math.pi))
def _ease_back_in_out(t):
    if t < 0.5:
        p = 2 * t
        return 0.5 * (p * p * p - p * _math.sin(p * _math.pi))
    p = 1 - (2 * t - 1)
    return 0.5 * (1 - (p * p * p - p * _math.sin(p * _math.pi))) + 0.5

def _ease_bounce_out(t):
    if t < 4 / 11:
        return 121 * t * t / 16
    elif t < 8 / 11:
        return (363 / 40.0 * t * t) - (99 / 10.0 * t) + 17 / 5.0
    elif t < 9 / 10:
        return (4356 / 361.0 * t * t) - (35442 / 1805.0 * t) + 16061 / 1805.0
    return (54 / 5.0 * t * t) - (513 / 25.0 * t) + 268 / 25.0
def _ease_bounce_in(t): return 1 - _ease_bounce_out(1 - t)
def _ease_bounce_in_out(t):
    if t < 0.5:
        return 0.5 * _ease_bounce_in(t * 2)
    return 0.5 * _ease_bounce_out(t * 2 - 1) + 0.5

def _ease_gamma_in(t, gamma): return _math.pow(t, gamma)
def _ease_gamma_out(t, gamma): return 1 - _math.pow(1 - t, gamma)
def _ease_gamma_in_out(t, gamma):
    if t < 0.5:
        return 0.5 * _math.pow(2 * t, gamma)
    return 0.5 * (2 - _math.pow(2 * (1 - t), gamma))

_EASINGS = {
    'linear': lambda t: t,
    'easeInQuad': _ease_quad_in, 'easeOutQuad': _ease_quad_out, 'easeInOutQuad': _ease_quad_in_out,
    'easeInCubic': _ease_cubic_in, 'easeOutCubic': _ease_cubic_out, 'easeInOutCubic': _ease_cubic_in_out,
    'easeInQuart': _ease_quart_in, 'easeOutQuart': _ease_quart_out, 'easeInOutQuart': _ease_quart_in_out,
    'easeInQuint': _ease_quint_in, 'easeOutQuint': _ease_quint_out, 'easeInOutQuint': _ease_quint_in_out,
    'easeInSine': _ease_sine_in, 'easeOutSine': _ease_sine_out, 'easeInOutSine': _ease_sine_in_out,
    'easeInCirc': _ease_circ_in, 'easeOutCirc': _ease_circ_out, 'easeInOutCirc': _ease_circ_in_out,
    'easeInExpo': _ease_expo_in, 'easeOutExpo': _ease_expo_out, 'easeInOutExpo': _ease_expo_in_out,
    'easeInElastic': _ease_elastic_in, 'easeOutElastic': _ease_elastic_out, 'easeInOutElastic': _ease_elastic_in_out,
    'easeInBack': _ease_back_in, 'easeOutBack': _ease_back_out, 'easeInOutBack': _ease_back_in_out,
    'easeInBounce': _ease_bounce_in, 'easeOutBounce': _ease_bounce_out, 'easeInOutBounce': _ease_bounce_in_out,
}
_GAMMA_EASINGS = {
    'easeInGamma': _ease_gamma_in, 'easeOutGamma': _ease_gamma_out, 'easeInOutGamma': _ease_gamma_in_out,
}


def _ease(name, gamma, t):
    if name in _GAMMA_EASINGS:
        return _GAMMA_EASINGS[name](t, gamma)
    fn = _EASINGS.get(name)
    if fn is None:
        return t  # unknown easing name - fall back to linear, matches Tween.js's own resolveEasing() fallback
    return fn(t)


# ==================== Smoother (AnalogIn/DigitalIn/Process) ====================
# Ported from app/scripts/utils/Smoother.js - a plain moving-average
# buffer, active only when the widget's 'smoothing' field is true.
class _Smoother:
    def __init__(self, buffer_len):
        self.buffer_len = max(1, int(buffer_len))
        self.values = []

    def set_buffer_length(self, size):
        self.buffer_len = max(1, int(size))
        self.values = [0.0] * self.buffer_len

    def smooth(self, value):
        if len(self.values) == 0:
            self.values = [value] * self.buffer_len
        else:
            self.values.pop(0)
            self.values.append(value)
        return sum(self.values) / len(self.values)


# ==================== generic signal-chain functions ====================
# Ported from app/scripts/utils/SignalChainFunctions.js.

def _sc_math(value, values):
    operand = _num(values.get('mathOperand'), 0.0)
    op = values.get('mathOperator')
    if op == '+':
        return value + operand
    if op == '-':
        return value - operand
    if op == '*':
        return value * operand
    if op == '/':
        return value if operand == 0 else value / operand
    return value


def _sc_scale(value, values):
    input_floor = _num(values.get('inputFloor'), 0.0)
    input_ceiling = _num(values.get('inputCeiling'), 1023.0)
    output_floor = _num(values.get('outputFloor'), 0.0)
    output_ceiling = _num(values.get('outputCeiling'), 1023.0)
    input_range = input_ceiling - input_floor
    if input_range == 0:
        return output_floor
    output_range = output_ceiling - output_floor
    scaling_factor = output_range / input_range
    return ((value - input_floor) * scaling_factor) + output_floor


def _sc_invert(value, values):
    if values.get('invert'):
        return (value - (value * 2)) + _num(values.get('outputCeiling'), 1023.0)
    return value


def _sc_limit_255(value, values):
    return max(0.0, min(255.0, value))


def _sc_limit_180(value, values):
    return max(0.0, min(180.0, value))


def _sc_apply_threshold(value, values):
    threshold = _num(values.get('threshold'), 512.0)
    return 1023.0 if value >= threshold else 0.0


def _sc_if_test(value, values, state):
    """Ported from IfThen.js's ifTest(). The real widget's hysteresis
    (waitTimeTrue/waitTimeFalse) fires via JS setTimeout, independent of
    any polling loop - here it's tick-polled elapsed-time instead (see
    module docstring)."""
    compare_value = _num(values.get('compareValue'), 512.0)
    compare_range = _num(values.get('compareRange'), 150.0) / 2.0
    wait_time_true = _num(values.get('waitTimeTrue'), 0.0)
    wait_time_false = _num(values.get('waitTimeFalse'), 0.0)
    operator = values.get('operator', '>')
    text_compare = str(values.get('text_comparison', '')).lower().strip()
    data_type = values.get('dataType', 'number')

    input_value = value
    if data_type == 'text':
        operator = values.get('operatorStr', 'contains')
        input_value = str(value).lower().strip()

    comparison = False
    if operator == '~=':
        comparison = (input_value >= (compare_value - compare_range)) and (value <= (compare_value + compare_range))
    elif operator == '>':
        comparison = input_value > compare_value
    elif operator == '<':
        comparison = input_value < compare_value
    elif operator == 'equals':
        comparison = input_value == text_compare
    elif operator == 'contains':
        delimiter = values.get('textDelimiter', ',')
        for part in text_compare.split(delimiter):
            if part.strip() in input_value:
                comparison = True
                break
    elif operator == 'part':
        comparison = input_value in text_compare

    now = state['now']
    if comparison:
        state['wait_last_false'] = False
        if wait_time_true == 0 or state.get('if_state') == 'falseWaiting':
            state['if_state'] = 'trueOn'
            state['wait_last_true'] = True
            return _num(values.get('ifTrue'), 1023.0)
        if not state.get('wait_last_true'):
            state['wait_true_start'] = now
            state['wait_last_true'] = True
            state['if_state'] = 'trueWaitStart'
            return _num(values.get('ifFalse'), 0.0)
        if (now - state['wait_true_start']) * 1000.0 >= wait_time_true:
            state['if_state'] = 'trueOn'
            return _num(values.get('ifTrue'), 1023.0)
        state['if_state'] = 'trueWaiting'
        return _num(values.get('ifFalse'), 0.0)
    else:
        state['wait_last_true'] = False
        if wait_time_false == 0 or state.get('if_state') == 'trueWaiting':
            state['if_state'] = 'falseOn'
            state['wait_last_false'] = True
            return _num(values.get('ifFalse'), 0.0)
        if not state.get('wait_last_false'):
            state['wait_false_start'] = now
            state['wait_last_false'] = True
            state['if_state'] = 'falseWaitStart'
            return _num(values.get('ifTrue'), 1023.0)
        if (now - state['wait_false_start']) * 1000.0 >= wait_time_false:
            state['if_state'] = 'falseOn'
            return _num(values.get('ifFalse'), 0.0)
        state['if_state'] = 'falseWaiting'
        return _num(values.get('ifTrue'), 1023.0)


# Per-type chain function lists. AnalogIn/DigitalIn/Process share the
# same (scale, invert, easing, smoother) chain - Process adds `math`
# first (ins/outs comparison in Process.js/AnalogIn.js/DigitalIn.js).
def _chain_easing(value, values, state):
    # Ported from Process.js's easing()/timeKeeper()/easeOutExpo() - a
    # 60fps-driven asymmetric ease toward the latest input, gated here to
    # ~60Hz (time-based, not tick-count-based) since this interpreter's
    # tick rate is much faster than 60fps and calling this every tick
    # would converge far faster than the original ever did.
    state['easing_new'] = value
    if not values.get('easing'):
        state['easing_last'] = value
        return value
    now = state['now']
    if now - state.get('easing_last_update', 0.0) >= (1.0 / 60.0):
        state['easing_last_update'] = now
        b = state.get('easing_last', value)
        c = state['easing_new'] - b
        d = _num(values.get('easingAmount'), 30.0)
        t = 0.17
        eased = c * (-(2.0 ** (-10.0 * t / d)) + 1.0) + b if d != 0 else state['easing_new']
        if abs(eased - state['easing_new']) < 0.4:
            eased = state['easing_new']
        state['easing_last'] = eased
    return state.get('easing_last', value)


def _chain_smoother(value, values, state):
    smoother = state.get('smoother')
    if smoother is None:
        smoother = _Smoother(_num(values.get('smoothingAmount'), 60.0))
        state['smoother'] = smoother
    if values.get('smoothing'):
        return int(smoother.smooth(value))
    return value


def _run_chain(fn_names, value, values, state):
    for name in fn_names:
        if name == 'math':
            value = _sc_math(value, values)
        elif name == 'scale':
            value = _sc_scale(value, values)
        elif name == 'invert':
            value = _sc_invert(value, values)
        elif name == 'easing':
            value = _chain_easing(value, values, state)
        elif name == 'smoother':
            value = _chain_smoother(value, values, state)
        elif name == 'limit255':
            value = _sc_limit_255(value, values)
        elif name == 'limit180':
            value = _sc_limit_180(value, values)
        elif name == 'threshold':
            value = _sc_apply_threshold(value, values)
        elif name == 'ifTest':
            value = _sc_if_test(value, values, state)
    return value


CHAIN_FUNCTIONS_BY_TYPE = {
    'AnalogIn': ['scale', 'invert', 'easing', 'smoother'],
    'DigitalIn': ['scale', 'invert', 'easing', 'smoother'],
    'Process': ['math', 'scale', 'invert', 'easing', 'smoother'],
    'IfThen': ['ifTest'],
    'AnalogOut': ['limit255'],
    'Servo': ['limit180'],
    'DigitalOut': ['threshold'],
}


# ==================== bespoke per-type widgets ====================
# Ported from each widget's own onModelChange()/compute logic - see the
# module docstring and plans/standalone-patch-export.md for how each was
# grounded against the real JS.

def _eval_boolean(values, state, now):
    threshold = _num(values.get('threshold'), 512.0)
    ins = [_num(values.get('in1')), _num(values.get('in2')), _num(values.get('in3')), _num(values.get('in4'))]
    mode = values.get('boolean', 'all')
    if mode == 'all':
        result = True
        for v in ins:
            if not _is_nan(v) and v < threshold:
                result = False
    elif mode == 'any':
        result = False
        for v in ins:
            if not _is_nan(v) and v >= threshold:
                result = True
    else:
        result = False
    values['output'] = _num(values.get('ifTrue'), 1023.0) if result else _num(values.get('ifFalse'), 0.0)


def _eval_gate(values, state, now):
    in_false = _num(values.get('inFalse'))
    in_true = _num(values.get('inTrue'))
    if not _is_nan(in_true):
        values['ifTrue'] = in_true
    if not _is_nan(in_false):
        values['ifFalse'] = in_false
    threshold = _num(values.get('threshold'), 512.0)
    in_gate = _num(values.get('inGate'), 0.0)
    values['output'] = _num(values.get('ifTrue'), 1023.0) if in_gate >= threshold else _num(values.get('ifFalse'), 0.0)


def _eval_mix(values, state, now):
    raw = [values.get('in1'), values.get('in2'), values.get('in3'), values.get('in4')]
    ins = [_num(v) for v in raw]
    finite_ins = [v for v in ins if not _is_nan(v)]
    mix_type = values.get('mixType', 'latest')
    prev = state.get('last_raw')
    if prev is None:
        # First tick for this widget - nothing has actually "changed"
        # yet (matches JS: onModelChange only fires on a real model.set()
        # diff, so a freshly-loaded widget's output stays at its declared
        # default until a real inlet write happens). Without this, every
        # field would look "changed" against an uninitialized sentinel
        # and 'latest' mode would pick whichever inlet is checked last,
        # not the one that actually changed.
        state['last_raw'] = list(raw)
        return
    result = 0.0
    if mix_type == 'latest':
        for i in range(4):
            if raw[i] != prev[i]:
                result = ins[i]
        state['last_raw'] = list(raw)
        values['output'] = result
        return
    state['last_raw'] = list(raw)
    if mix_type == 'avg':
        result = (sum(finite_ins) / len(finite_ins)) if finite_ins else 0.0
    elif mix_type == 'sum':
        result = sum(finite_ins)
    elif mix_type == 'mult':
        result = 1.0
        for v in finite_ins:
            result *= v
        if not finite_ins:
            result = 0.0
    elif mix_type == 'min':
        result = min(finite_ins) if finite_ins else 0.0
    elif mix_type == 'max':
        result = max(finite_ins) if finite_ins else 0.0
    if finite_ins:
        values['output'] = result
    # else: JS deliberately sends no output when every input is non-numeric - leave 'output' unchanged.


def _envelope(value, center, width, lo, hi):
    start = center - (width / 2.0)
    end = center + (width / 2.0)
    sustain_start = start + (width / 3.0)
    sustain_end = sustain_start + (width / 3.0)
    level_scale = hi - lo
    attack_range = level_scale / (sustain_start - start) if (sustain_start - start) else 0
    release_range = level_scale / (end - sustain_end) if (end - sustain_end) else 0
    if start <= value <= end:
        if sustain_start <= value <= sustain_end:
            return int(hi)
        elif value < sustain_start:
            return int(((value - start) * attack_range) + lo)
        else:
            return int(hi - ((value - sustain_end) * release_range))
    return int(lo)


def _eval_splitter(values, state, now):
    value = _num(values.get('in'), 0.0)
    width = int(_num(values.get('outWidth'), 150.0))
    lo = int(_num(values.get('outMin'), 0.0))
    hi = int(_num(values.get('outMax'), 1023.0))
    values['outA'] = _envelope(value, _num(values.get('outACenter'), 200.0), width, lo, hi)
    values['outB'] = _envelope(value, _num(values.get('outBCenter'), 400.0), width, lo, hi)
    values['outC'] = _envelope(value, _num(values.get('outCCenter'), 600.0), width, lo, hi)
    values['outD'] = _envelope(value, _num(values.get('outDCenter'), 800.0), width, lo, hi)


def _eval_count(values, state, now):
    threshold = _num(values.get('threshold'), 512.0)
    last_ins = state.setdefault('last_ins', [-1.0, -1.0, -1.0, -1.0])
    increase_by = 0
    for i in range(4):
        v = _num(values.get('in' + str(i + 1)))
        if v != last_ins[i]:
            if last_ins[i] < threshold <= v:
                increase_by += 1
            last_ins[i] = v
    if increase_by:
        increment = _num(values.get('increment'), 1.0)
        result = _num(values.get('output'), 0.0) + (increase_by * increment)
        ceiling = _num(values.get('outputCeiling'), 10.0)
        floor = _num(values.get('outputFloor'), 0.0)
        if result > ceiling:
            result = floor
        elif result < floor:
            result = ceiling
        values['output'] = result


def _eval_concat(values, state, now):
    sep = values.get('separator', ', ')
    parts = []
    for key in ('in1', 'in2', 'in3', 'in4'):
        v = values.get(key, '')
        if v != '':
            parts.append(str(v))
    values['out1'] = sep.join(parts)


def _eval_pulse(values, state, now):
    threshold = _num(values.get('threshold'), 512.0)
    in_value = _num(values.get('in'))
    firing = state.get('firing', False)

    if not _is_nan(in_value):
        if in_value >= threshold and not firing:
            state['firing'] = True
            firing = True
            _pulse_init_timer(values, state, now)
        elif in_value < threshold and firing:
            state['firing'] = False
            firing = False
            if (not values.get('randOut')) or values.get('randOutPulse'):
                values['output'] = _num(values.get('pulseLow'), 0.0)

    if firing:
        timer_length = _num(values.get('timerLength'), 1000.0)
        high_pct = _num(values.get('timerHighPercentage'), 50.0)
        elapsed_ms = (now - state.get('timer_start', now)) * 1000.0
        if (not values.get('randOut')) or values.get('randOutPulse'):
            if elapsed_ms > timer_length * (high_pct / 100.0):
                values['output'] = _num(values.get('pulseLow'), 0.0)
        if elapsed_ms > timer_length:
            values['output'] = _num(values.get('pulseHigh'), 1023.0)
            _pulse_init_timer(values, state, now)


def _pulse_init_timer(values, state, now):
    import random
    state['timer_start'] = now
    if values.get('randTime'):
        lo = _num(values.get('randTimeLow'), 750.0)
        hi = _num(values.get('randTimeHigh'), 2000.0)
        values['timerLength'] = lo + random.random() * (hi - lo)
    if values.get('randOut'):
        lo = _num(values.get('randLow'), 0.0)
        hi = _num(values.get('randHigh'), 1023.0)
        values['pulseHigh'] = lo + random.random() * (hi - lo + 1)


def _eval_tween(values, state, now):
    threshold = _num(values.get('threshold'), 512.0)
    in_value = _num(values.get('in'))
    last_input = state.get('last_input', -1.0)

    if not _is_nan(in_value):
        if in_value >= threshold and last_input < threshold:
            _tween_start(values, state, now, _num(values.get('start'), 0.0), _num(values.get('end'), 1023.0))
        elif in_value < threshold and last_input >= threshold:
            if values.get('returnToStart'):
                _tween_start(values, state, now, _num(values.get('output'), 0.0), _num(values.get('start'), 0.0))
            else:
                state['running'] = False
        state['last_input'] = in_value

    if state.get('running'):
        duration = max(1.0, _num(values.get('duration'), 2000.0))
        elapsed_ms = (now - state['tween_start_time']) * 1000.0
        t = min(1.0, elapsed_ms / duration)
        eased_t = _ease(values.get('tweenEasing', 'easeInQuad'), _num(values.get('gamma'), 2.8), t)
        start = state['tween_from']
        end = state['tween_to']
        values['output'] = start + (end - start) * eased_t
        if t >= 1.0:
            state['running'] = False


def _tween_start(values, state, now, from_value, to_value):
    state['running'] = True
    state['tween_start_time'] = now
    state['tween_from'] = from_value
    state['tween_to'] = to_value


def _eval_sequence(values, state, now):
    """Simplified vs. Sequence.js: linear per-segment interpolation
    instead of replicating Velocity's default easing (never
    user-configurable for this widget - see module docstring)."""
    threshold = _num(values.get('threshold'), 512.0)
    last_ins = state.setdefault('last_ins', [-1.0, -1.0, -1.0, -1.0])
    active_seq = state.get('active_seq')

    for i in range(4):
        v = _num(values.get('in' + str(i)))
        if v == last_ins[i]:
            continue
        if v >= threshold and last_ins[i] < threshold:
            _sequence_start_segment(values, state, now, i, 0)
            active_seq = i
        elif v < threshold and last_ins[i] >= threshold and i == active_seq:
            if values.get('returnToStart' + str(i), True):
                _sequence_return(values, state, now, i)
            else:
                state['running'] = False
        last_ins[i] = v

    if state.get('running'):
        _sequence_tick(values, state, now)


def _parse_sequence_steps(text):
    steps = []
    for line in str(text).replace('\r\n', '\n').replace('\r', '\n').split('\n'):
        parts = line.split(',')
        if len(parts) >= 3:
            try:
                steps.append((_num(parts[0]), _num(parts[1]), max(1.0, _num(parts[2]))))
            except (TypeError, ValueError):
                pass
    return steps


def _sequence_start_segment(values, state, now, seq_index, step_index):
    steps = _parse_sequence_steps(values.get('sequence' + str(seq_index), ''))
    if not steps:
        return
    state['seq_steps'] = steps
    state['seq_index'] = seq_index
    state['seq_step'] = step_index
    state['seq_step_start'] = now
    state['running'] = True
    state['send_to'] = values.get('sendTo' + str(seq_index), 'output0')


def _sequence_tick(values, state, now):
    steps = state.get('seq_steps') or []
    step_i = state.get('seq_step', 0)
    if step_i >= len(steps):
        state['running'] = False
        return
    start, end, duration = steps[step_i]
    elapsed_ms = (now - state['seq_step_start']) * 1000.0
    t = min(1.0, elapsed_ms / duration)
    values[state.get('send_to', 'output0')] = start + (end - start) * t
    if t >= 1.0:
        next_step = step_i + 1
        if next_step >= len(steps):
            seq_index = state.get('seq_index', 0)
            if values.get('loop' + str(seq_index), True):
                state['seq_step'] = 0
                state['seq_step_start'] = now
            else:
                state['running'] = False
        else:
            state['seq_step'] = next_step
            state['seq_step_start'] = now


def _sequence_return(values, state, now, seq_index):
    duration = max(1.0, _num(values.get('duration' + str(seq_index)), 1000.0))
    end = _num(values.get('start' + str(seq_index)), 0.0)
    start = _num(values.get('output0'), 0.0)
    state['seq_steps'] = [(start, end, duration)]
    state['seq_index'] = seq_index
    state['seq_step'] = 0
    state['seq_step_start'] = now
    state['running'] = True
    state['send_to'] = 'output0'


def _eval_data(values, state, now):
    if not state.get('built'):
        _data_build_database(values, state)
        _data_set_order(values, state)
        state['built'] = True

    in_trigger = values.get('inTrigger')
    if in_trigger != state.get('last_trigger'):
        state['last_trigger'] = in_trigger
        input_value = _num(in_trigger, 0.0)
        lo = _num(values.get('rangeMin'), 512.0)
        hi = _num(values.get('rangeMax'), 1023.0) + 1
        segments = max(1, int(_num(values.get('segments'), 1.0)))
        segment_size = (hi - lo) / segments if segments else 1
        segment = int((input_value - lo) / segment_size) if segment_size else 0
        if 0 <= segment < segments and segment != state.get('last_segment'):
            _data_next_element(values, state)
        state['last_segment'] = segment

    in_index = values.get('inIndex')
    if in_index != state.get('last_index') and in_index is not None:
        state['last_index'] = in_index
        _data_index_element(values, state, int(_num(in_index, 0.0)))


def _data_build_database(values, state):
    if values.get('dataType', 'text') == 'text':
        delimiter = values.get('delimiter', ',')
        if delimiter == '\\n':
            delimiter = '\n'
        text = str(values.get('database', '')).replace('\r\n', '\n').replace('\r', '\n')
        state['elements'] = text.split(delimiter)
    else:
        lo = int(_num(values.get('numericMin'), 0.0))
        hi = int(_num(values.get('numericMax'), 1023.0))
        state['elements'] = list(range(lo, hi + 1))


def _data_set_order(values, state):
    import random
    elements = state.get('elements', [])
    order = list(range(len(elements)))
    mode = values.get('orderType', 'ordered')
    if mode == 'reverse':
        order.reverse()
    elif mode == 'randomFull':
        random.shuffle(order)
    elif mode in ('randomNoRepeat', 'randomAny'):
        # matches Data.js's randomize(): pick a fresh random draw per slot
        # from the ORIGINAL order, re-drawing on a repeat only in the
        # no-repeat case.
        src = list(order)
        new_order = [random.choice(src)]
        for _ in range(1, len(src)):
            pick = random.choice(src)
            if mode == 'randomNoRepeat':
                while src and pick == new_order[-1]:
                    pick = random.choice(src)
            new_order.append(pick)
        order = new_order
    state['element_order'] = order
    state['current_element'] = 0


def _data_next_element(values, state):
    elements = state.get('elements', [])
    order = state.get('element_order', [])
    current = state.get('current_element', 0)
    if not order or not elements:
        return
    element_index = order[current] if current < len(order) else 0
    values['dataOut'] = elements[element_index] if element_index < len(elements) else ''
    current += 1
    if current >= len(elements):
        _data_set_order(values, state)
    else:
        state['current_element'] = current


def _data_index_element(values, state, index):
    order = state.get('element_order', [])
    elements = state.get('elements', [])
    if 0 <= index < len(order):
        element_index = order[index]
        if element_index < len(elements):
            values['dataOut'] = elements[element_index]


BESPOKE_EVAL = {
    'Boolean': _eval_boolean,
    'Gate': _eval_gate,
    'Mix': _eval_mix,
    'Splitter': _eval_splitter,
    'Count': _eval_count,
    'Concat': _eval_concat,
    'Pulse': _eval_pulse,
    'Tween': _eval_tween,
    'Sequence': _eval_sequence,
    'Data': _eval_data,
}

# outs[].{from,to} per type - what field each type's real computed value
# lives under (matches each widget's own `outs:` array in its .js file).
OUTS_BY_TYPE = {
    'AnalogIn': [('in', 'out')],
    'DigitalIn': [('in', 'out')],
    'AnalogOut': [('in', 'out')],
    'DigitalOut': [('in', 'out')],
    'Servo': [('in', 'out')],
    'Process': [('in', 'out')],
    'IfThen': [('in', 'out')],
    'Boolean': [('output', 'out1')],
    'Gate': [('output', 'out1')],
    'Mix': [('output', 'out1')],
    'Count': [('output', 'out1')],
    'Concat': [('out1', 'out1')],  # Concat writes out1 directly, no separate internal field
    'Pulse': [('output', 'out1')],
    'Tween': [('output', 'out1')],
    'Splitter': [('outA', 'out1'), ('outB', 'out2'), ('outC', 'out3'), ('outD', 'out4')],
    'Sequence': [('output0', 'out0')],
    'Data': [('dataOut', 'out')],
}


def _pin_index_for_dpin(pins, dpin_str):
    """"D<N>" -> self.pins[N] directly - matches StandardFirmataModel.js's
    parseInt(pin.substr(1),10) used for every OUTPUT-capable pin
    (DigitalIn/DigitalOut/Servo/AnalogOut's PWM path) and NTK's own
    "D"+index addressing convention (see addDefaultPins())."""
    try:
        return int(dpin_str[1:])
    except (TypeError, ValueError, IndexError):
        return None


def _pin_index_for_apin(pins, apin_str):
    """"A<N>" -> the pin whose analog_channel == N - NOT index N directly.
    Confirmed against server/modules/nlHardware/StandardFirmataModel.js's
    addDefaultPins(): `new five.Sensor({pin: "A"+reportedPin.analogChannel})`
    - the "A"-prefixed name is built from the device's own reported
    analog CHANNEL, not its pin index. These coincide for A0-A2 (this
    board's D0-D2 dual-purpose pins) but NOT for A3-A5 (the virtual
    accelerometer axes in pins.py, appended after the real D0-D10
    entries at indices 11-13 while keeping channels 3-5) - a direct
    int(s[1:]) index parse would silently read the wrong thing there."""
    try:
        channel = int(apin_str[1:])
    except (TypeError, ValueError, IndexError):
        return None
    for i, pin in enumerate(pins):
        if pin.analog_channel == channel:
            return i
    return None


class StandaloneInterpreter:
    def __init__(self, pin_table):
        # A dedicated FirmataServer instance, separate from the one
        # run_server() constructs per TCP connection - reuses its pin
        # management (_apply_pin_mode/_handle_analog_write/
        # _handle_report_analog/release_all_pins) directly rather than
        # reimplementing pin claiming, servo pulse-width math, and PWM
        # duty-cycle math a second time. release_hardware() below must be
        # called before a real client connects, so its pin claims don't
        # collide with the per-connection FirmataServer's own.
        self._fs = firmata_server.FirmataServer(pin_table)
        self.widgets = {}      # wid -> {typeID, values, state}
        self.steps = []        # ordered (kind, ...) tuples - see _build_steps()
        self.loaded = False
        self.error = None

    def load(self, patch):
        widgets = (patch or {}).get('widgets', [])
        mappings = (patch or {}).get('mappings', [])

        unsupported = [w for w in widgets if w.get('typeID') not in PORTABLE_TYPE_IDS]
        if unsupported:
            self.error = "Unsupported widgets: " + ", ".join(
                "%s (%s)" % (w.get('title', w.get('typeID')), w.get('typeID')) for w in unsupported
            )
            self.loaded = False
            return False

        self.widgets = {}
        for w in widgets:
            self.widgets[w['wid']] = {
                'typeID': w['typeID'],
                'values': dict(w),  # copy every saved field - config AND transient - as starting values
                'state': {},
            }

        self._build_steps(widgets, mappings)
        self.loaded = True
        self.error = None
        return True

    def _build_steps(self, widgets, mappings):
        widget_ids = set(self.widgets.keys())

        # widget-to-widget mapping edges only - hardware mappings
        # (modelWID = "type:server:port") don't participate in ordering,
        # they're applied as a direct pin read/write around that one
        # widget's own evaluation step instead.
        edges = {}   # wid -> set(dependency wids)
        w2w_mappings = []
        hw_in_mappings = {}   # wid -> mapping (AnalogIn/DigitalIn)
        hw_out_mappings = {}  # wid -> mapping (AnalogOut/DigitalOut/Servo)

        for m in mappings:
            model_wid, view_wid = m.get('modelWID'), m.get('viewWID')
            if model_wid in widget_ids:
                w2w_mappings.append(m)
                edges.setdefault(view_wid, set()).add(model_wid)
            elif view_wid in widget_ids:
                type_id = self.widgets[view_wid]['typeID']
                if type_id in HARDWARE_INPUT_TYPES:
                    hw_in_mappings[view_wid] = m
                elif type_id in HARDWARE_OUTPUT_TYPES:
                    hw_out_mappings[view_wid] = m

        # Kahn's algorithm - widgets with no unresolved dependency go
        # first. A cycle (shouldn't happen in a normal patch) just gets
        # its remaining members appended in arbitrary order rather than
        # crashing the whole interpreter over one bad patch.
        remaining = dict((wid, set(deps)) for wid, deps in edges.items())
        for wid in widget_ids:
            remaining.setdefault(wid, set())
        ordered = []
        while remaining:
            ready = [wid for wid, deps in remaining.items() if not deps]
            if not ready:
                ordered.extend(remaining.keys())
                print("standalone_interpreter: mapping cycle detected, evaluation order may be wrong for", list(remaining.keys()))
                break
            for wid in ready:
                ordered.append(wid)
                del remaining[wid]
            for deps in remaining.values():
                deps.difference_update(ready)

        steps = []
        for wid in ordered:
            for m in w2w_mappings:
                if m.get('viewWID') == wid:
                    steps.append(('map', m.get('modelWID'), m['map']['sourceField'], wid, m['map']['destinationField']))
            if wid in hw_in_mappings:
                steps.append(('hw_in', wid, hw_in_mappings[wid]['map']['sourceField']))
            steps.append(('eval', wid))
            if wid in hw_out_mappings:
                steps.append(('hw_out', wid, hw_out_mappings[wid]['map']['destinationField']))

        self.steps = steps

    def claim_hardware(self):
        """Call once before ticking (or again after regaining control
        from a disconnected host client) - claims every pin this loaded
        patch's hardware widgets need, via FirmataServer's own pin-mode
        setup so servo pulse math / PWM duty math / analog scaling all
        come from the same already-verified code path a live Firmata
        connection uses."""
        fs = self._fs
        for step in self.steps:
            if step[0] == 'hw_in':
                _, wid, pin_str = step
                type_id = self.widgets[wid]['typeID']
                if type_id == 'AnalogIn':
                    try:
                        channel = int(pin_str[1:])
                    except (TypeError, ValueError, IndexError):
                        continue
                    fs._handle_report_analog(channel, True)
                elif type_id == 'DigitalIn':
                    idx = _pin_index_for_dpin(fs.pins, pin_str)
                    if idx is not None:
                        fs._apply_pin_mode(idx, firmata_server.INPUT)
                        fs.pins[idx].report = True
            elif step[0] == 'hw_out':
                _, wid, pin_str = step
                type_id = self.widgets[wid]['typeID']
                idx = _pin_index_for_dpin(fs.pins, pin_str)
                if idx is None:
                    continue
                if type_id == 'Servo':
                    fs._handle_servo_config(idx, firmata_server.SERVO_MIN_PULSE_US_DEFAULT, firmata_server.SERVO_MAX_PULSE_US_DEFAULT)
                elif type_id == 'AnalogOut':
                    fs._apply_pin_mode(idx, firmata_server.PWM)
                elif type_id == 'DigitalOut':
                    fs._apply_pin_mode(idx, firmata_server.OUTPUT)

    def release_hardware(self):
        """Call right before a real Firmata client connects, so its own
        fresh FirmataServer instance can claim the same physical pins
        without hitting "pin in use" errors."""
        self._fs.release_all_pins()

    def tick(self):
        if not self.loaded:
            return
        now = time.monotonic()
        fs = self._fs
        for step in self.steps:
            kind = step[0]
            if kind == 'map':
                _, src_wid, src_field, dst_wid, dst_field = step
                src = self.widgets.get(src_wid)
                if src is not None:
                    self.widgets[dst_wid]['values'][dst_field] = src['values'].get(src_field)
            elif kind == 'hw_in':
                _, wid, pin_str = step
                w = self.widgets[wid]
                type_id = w['typeID']
                if type_id == 'AnalogIn':
                    idx = _pin_index_for_apin(fs.pins, pin_str)
                    if idx is not None and fs.pins[idx].io is not None:
                        raw16 = fs.pins[idx].io.value
                        w['values']['in'] = raw16 >> 6  # 16-bit -> 10-bit, matches firmata_server.update()
                elif type_id == 'DigitalIn':
                    idx = _pin_index_for_dpin(fs.pins, pin_str)
                    if idx is not None and fs.pins[idx].io is not None:
                        w['values']['in'] = 1 if fs.pins[idx].io.value else 0
            elif kind == 'eval':
                wid = step[1]
                w = self.widgets[wid]
                self._eval_widget(w, now)
            elif kind == 'hw_out':
                _, wid, pin_str = step
                w = self.widgets[wid]
                idx = _pin_index_for_dpin(fs.pins, pin_str)
                if idx is not None:
                    out_value = w['values'].get('out')
                    if w['typeID'] == 'DigitalOut':
                        if fs.pins[idx].io is not None:
                            fs.pins[idx].io.value = bool(out_value)
                    elif w['typeID'] == 'Servo':
                        # The widget's own 'out' is 0-180 DEGREES (limit180
                        # chain), but _handle_analog_write's SERVO branch
                        # expects a microsecond pulse width directly (see
                        # its own comment in firmata_server.py) - on a live
                        # connection, johnny-five's five.Servo does this
                        # degrees->microseconds conversion host-side before
                        # ever reaching the wire (range:[0,180], default
                        # pwmRange:[600,2400] - confirmed against
                        # node_modules/johnny-five/lib/servo.js and
                        # StandardFirmataModel.js's `new five.Servo(...)`
                        # call, which passes no custom pwmRange). Since the
                        # interpreter skips johnny-five entirely, it has to
                        # do that same conversion itself, or every write
                        # just clamps to the 544us floor and the servo
                        # never moves - which is exactly the historical bug
                        # that comment describes.
                        degrees = max(0.0, min(180.0, _num(out_value, 0.0)))
                        pulse_us = int(degrees * (2400.0 - 600.0) / 180.0 + 600.0)
                        fs._handle_analog_write(idx, pulse_us)
                    else:
                        fs._handle_analog_write(idx, out_value)

    def _eval_widget(self, w, now):
        type_id = w['typeID']
        values = w['values']
        state = w['state']
        state['now'] = now

        if type_id in BESPOKE_EVAL:
            BESPOKE_EVAL[type_id](values, state, now)

        if type_id in CHAIN_TYPES:
            chain = CHAIN_FUNCTIONS_BY_TYPE[type_id]
            for from_field, to_field in OUTS_BY_TYPE[type_id]:
                values[to_field] = _run_chain(chain, _num(values.get(from_field), 0.0), values, state)
        elif type_id in OUTS_BY_TYPE:
            for from_field, to_field in OUTS_BY_TYPE[type_id]:
                if from_field != to_field:
                    values[to_field] = values.get(from_field)


def load_patch_file(path):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError) as e:
        print("standalone_interpreter: couldn't load", path, ":", e)
        return None
