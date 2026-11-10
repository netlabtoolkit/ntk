"""
The Scene widget's script on the board - a port of NTK's
app/scripts/utils/SceneScript.js (parse + runner), so a standalone patch
plays a scene exactly as NTK does. Both must pass test/scene-cases.json:
NTK's with `node test/scene-test.js`, this one with
`python3 -I test/scene_test.py`. Error messages are part of the format -
keep them word for word the same as the JS.

Times are whole milliseconds. No `re` (CircuitPython's is limited), no
classes beyond the error, so it stays small; loaded by
standalone_interpreter.py only when a patch has a Scene in it.

Not ported: the JS status's `lines` / `linesLeft` (NTK's script-box
highlight only).
"""

MAX_OUTS = 4
RESERVED = ('cue', 'idle', 'repeat', 'blink', 'outs', 'in1', 'in2', 'when', 'after', 'to', 'in',
            'every', 'between', 'and', 'for', 'ease', 'from', 'max', 'then', 'loop', 'until',
            'times', 'wait')
MAX_CUE_CHANGES_PER_TICK = 100
# Same order as SceneScript.js's EASINGS - it's in an error message.
EASING_NAMES = ('quad', 'cubic', 'quart', 'quint', 'sine', 'circ', 'expo', 'elastic', 'back', 'bounce')
EASE_SIDES = {'in': 0, 'out': 1, 'in-out': 2}
_DIGITS = '0123456789'
_LETTERS = 'abcdefghijklmnopqrstuvwxyz'


class ParseError(Exception):
    pass


# ---- small helpers (what the JS does with regexes) ----

def _round(x):
    # JS Math.round: halves go up (Python's round() goes to even).
    i = int(x)
    if x - i >= 0.5:
        i += 1
    elif x < 0 and i - x > 0.5:
        i -= 1
    return i


def _is_digits(s):
    if not s:
        return False
    for c in s:
        if c not in _DIGITS:
            return False
    return True


def _is_unsigned(s):
    # \d+(\.\d+)? or \.\d+
    if s.startswith('.'):
        return _is_digits(s[1:])
    parts = s.split('.')
    if len(parts) == 1:
        return _is_digits(s)
    return len(parts) == 2 and _is_digits(parts[0]) and _is_digits(parts[1])


def _is_number(s):
    return _is_unsigned(s[1:] if s.startswith('-') else s)


def _js_num(x):
    # A number as JS writes it: 1 not 1.0.
    if x == int(x):
        return str(int(x))
    return str(x)


def parse_time(word):
    """'2s' -> 2000, '500ms' -> 500. A bare number is an error, not a guess."""
    word = word or ''
    if word.endswith('ms') and _is_unsigned(word[:-2]):
        return _round(float(word[:-2]))
    if word.endswith('s') and not word.endswith('ms') and _is_unsigned(word[:-1]):
        return _round(float(word[:-1]) * 1000)
    if _is_number(word) and not word.startswith('.') and not word.startswith('-.'):
        raise ParseError('add "s" or "ms" to ' + word)
    raise ParseError('"' + word + '" isn\'t a time - write it like 2s or 500ms')


def parse_time_range(word):
    parts = str(word).split('..')
    if len(parts) > 2:
        raise ParseError('"' + word + '" isn\'t a time - write it like 2s or 2s..6s')
    lo = parse_time(parts[0])
    hi = parse_time(parts[1]) if len(parts) == 2 else lo
    if hi < lo:
        raise ParseError('the shorter time goes first: ' + parts[1] + '..' + parts[0])
    return lo, hi


def parse_number(word):
    if not _is_number(word or ''):
        raise ParseError('"' + (word or '') + '" isn\'t a number')
    return float(word)


def tokenize(text):
    """Words, keeping "quoted text" as one: [(text, quoted)]."""
    words = []
    i, n = 0, len(text)
    while i < n:
        if text[i].isspace():
            i += 1
            continue
        if text[i] == '"':
            close = text.find('"', i + 1)
            if close != -1:
                words.append((text[i + 1:close], True))
                i = close + 1
                continue
        j = i
        while j < n and not text[j].isspace():
            j += 1
        words.append((text[i:j], False))
        i = j
    return words


def strip_comment(line):
    in_quote = False
    for i, c in enumerate(line):
        if c == '"':
            in_quote = not in_quote
        elif c == '#' and not in_quote:
            return line[:i]
    return line


def _outlet_index(scene, word):
    name = str(word).lower()
    if len(name) == 4 and name.startswith('out') and name[3] in '1234':
        return int(name[3]) - 1
    if name in scene['outs']:
        return scene['outs'].index(name)
    named = [n for n in scene['outs'] if n]
    raise ParseError('no outlet called "' + str(word) + '"' + (' (outlets: ' + ', '.join(named) + ')' if named else ''))


def _writable_outlet(scene, word):
    index = _outlet_index(scene, word)
    if index == scene['running_out']:
        raise ParseError('"running" is set by the scene itself - it can\'t be changed')
    return index


def _parse_action(scene, words, timed):
    at = 0
    has_time = False
    if timed and words and not words[0][1] and words[0][0] and (words[0][0][0] in _DIGITS or words[0][0][0] == '.'):
        at = parse_time(words[0][0])
        has_time = True
        words = words[1:]
    if not words:
        raise ParseError('a time needs something to do after it')

    def w(i):
        return words[i][0] if i < len(words) else None

    def lw(i):
        return words[i][0].lower() if i < len(words) else None

    if lw(0) == 'wait':
        if len(words) < 2:
            raise ParseError('wait how long? e.g. wait 1s')
        if len(words) > 2:
            raise ParseError('didn\'t expect "' + w(2) + '" after the wait')
        return {'at': at, 'kind': 'wait', 'duration': parse_time(w(1)), 'has_time': has_time, 'written': w(1)}

    if lw(0) == 'blink':
        if len(words) < 2:
            raise ParseError('blink what? e.g. blink lamp every 0.5s')
        targets = w(1).split('/')
        if len(targets) > 2:
            raise ParseError('blink alternates at most two outlets, like left/right')
        action = {'at': at, 'kind': 'blink', 'outs': [_writable_outlet(scene, t) for t in targets],
                  'every': None, 'lo': 0, 'hi': 1, 'duration': None}
        i = 2
        while i < len(words):
            if lw(i) == 'every':
                action['every'] = parse_time(w(i + 1))
                i += 2
            elif lw(i) == 'for':
                action['duration'] = parse_time(w(i + 1))
                i += 2
            elif lw(i) == 'between':
                if lw(i + 2) != 'and':
                    raise ParseError('write it like: between 0 and 255')
                action['lo'] = parse_number(w(i + 1))
                action['hi'] = parse_number(w(i + 3))
                i += 4
            else:
                raise ParseError('didn\'t expect "' + str(w(i)) + '" in a blink')
        if action['every'] is None:
            raise ParseError('blink needs "every" and a time, e.g. every 0.5s')
        if action['every'] <= 0:
            raise ParseError('blink "every" must be longer than 0s')
        return action

    if w(1) == '=':
        if len(words) != 3:
            raise ParseError('write a set like: lamp = 1')
        out = _writable_outlet(scene, w(0))
        value = words[2][0] if words[2][1] else parse_number(w(2))
        return {'at': at, 'kind': 'set', 'out': out, 'value': value}

    if lw(1) == 'to':
        ramp = {'at': at, 'kind': 'ramp', 'out': _writable_outlet(scene, w(0)), 'ease': None}
        if len(words) > 2 and words[2][1]:
            raise ParseError('text can\'t ramp - use = to set it')
        ramp['to'] = parse_number(w(2))
        if lw(3) != 'in':
            raise ParseError('a ramp needs "in" and a time, e.g. gate to 90 in 3s')
        ramp['duration'] = parse_time(w(4))
        if len(words) > 5:
            if lw(5) != 'ease':
                raise ParseError('didn\'t expect "' + w(5) + '" after the ramp')
            side, curve = 'in-out', lw(6)
            if curve in EASE_SIDES:
                side, curve = curve, lw(7)
            if curve not in EASING_NAMES:
                raise ParseError('no easing called "' + (curve or '') + '" (easings: ' + ', '.join(EASING_NAMES) + ')')
            used = 7 if (side == 'in-out' and lw(6) != 'in-out') else 8
            if len(words) > used:
                raise ParseError('didn\'t expect "' + w(used) + '" after the easing')
            ramp['ease'] = (EASE_SIDES[side], curve)
        return ramp

    raise ParseError('can\'t read "' + ' '.join(x[0] for x in words) + '"')


def _parse_loop(rest):
    if not rest:
        return {'type': 'forever'}
    if rest[0] == 'until':
        r1 = rest[1] if len(rest) > 1 else None
        r2 = rest[2] if len(rest) > 2 else None
        if r1 not in ('in1', 'in2'):
            raise ParseError('"loop until" needs in1 or in2, e.g. loop until in1 high')
        if r2 not in ('high', 'low'):
            raise ParseError('"loop until ' + r1 + '" needs high or low after it')
        if len(rest) > 3:
            raise ParseError('didn\'t expect "' + rest[3] + '" after "loop until ' + r1 + ' ' + r2 + '"')
        return {'type': 'until', 'inlet': r1, 'level': r2}
    if len(rest) == 2 and rest[1] in ('times', 'time'):
        if not _is_digits(rest[0]) or int(rest[0]) < 1:
            raise ParseError('"' + rest[0] + '" isn\'t a number of times - write it like: loop 3 times')
        return {'type': 'times', 'count': int(rest[0])}
    raise ParseError('write it like: loop, loop 3 times, or loop until in1 high')


def _parse_cue(words, index):
    i, name_words = 1, []
    while i < len(words) and words[i][0].lower() not in ('when', 'after', 'loop'):
        name_words.append(words[i][0])
        i += 1
    label = ' '.join(name_words)
    cue = {'name': label.lower(), 'label': label or 'cue ' + str(index + 1),
           'trigger': {'type': 'next'}, 'loop': None, 'lines': [], 'length': 0}
    lower = [x[0].lower() for x in words]
    loop_at = -1
    for k in range(i, len(lower)):
        if lower[k] == 'loop':
            loop_at = k
            break
    if loop_at != -1:
        cue['loop'] = _parse_loop(lower[loop_at + 1:])
        words = words[:loop_at]
    if i >= len(words):
        return cue
    kind = words[i][0].lower()
    rest = [x[0].lower() for x in words[i + 1:]]
    if kind == 'after':
        if len(rest) != 1:
            raise ParseError('write it like: cue NAME after 2s (or after 2s..6s)')
        lo, hi = parse_time_range(rest[0])
        cue['trigger'] = {'type': 'after', 'min': lo, 'max': hi}
        return cue
    # when
    r0 = rest[0] if rest else None
    r1 = rest[1] if len(rest) > 1 else None
    if r0 not in ('in1', 'in2'):
        raise ParseError('"when" needs in1 or in2, e.g. when in1 high')
    # high / low: a level, true at once if it already is. rises / falls:
    # a change seen while the cue waits (SceneScript.js).
    if r1 not in ('high', 'low', 'rises', 'falls'):
        raise ParseError('"when ' + r0 + '" needs high, low, rises or falls after it')
    cue['trigger'] = {'type': 'when', 'inlet': r0, 'level': r1, 'max': None}
    if len(rest) > 2:
        if rest[2] != 'max' or len(rest) != 4:
            raise ParseError('after "when ' + r0 + ' ' + r1 + '" only "max" and a time can follow')
        cue['trigger']['max'] = parse_time(rest[3])
    return cue


def line_length(line):
    if line['kind'] in ('ramp', 'wait'):
        return line['at'] + line['duration']
    if line['kind'] == 'blink' and line['duration'] is not None:
        return line['at'] + line['duration']
    return line['at']


def _line_outs(line):
    if line['kind'] == 'wait':
        return []
    return line['outs'] if line['kind'] == 'blink' else [line['out']]


def _check_overlaps(scene, lines):
    for i, line in enumerate(lines):
        for j in range(i):
            before = lines[j]
            if before['at'] != line['at']:
                continue
            if not (before['kind'] == 'blink' or (before['kind'] == 'ramp' and before['duration'] > 0)):
                continue
            shared = [o for o in _line_outs(line) if o in _line_outs(before)]
            if not shared:
                continue
            name = scene['outs'][shared[0]] or 'out' + str(shared[0] + 1)
            scene['errors'].append((line['line'], '"' + name + '" already has a move at ' + _js_num(line['at'] / 1000) +
                                    's (line ' + str(before['line']) + ') - this replaces it at once; use "then" to start it after'))
            break


def _sort_lines(lines):
    # Time order; same time keeps the order written (sorted() is stable).
    return sorted(lines, key=lambda l: l['at'])


def _valid_outlet_name(name):
    if not name or name[0] not in _LETTERS:
        return False
    for c in name:
        if c not in _LETTERS and c not in _DIGITS and c not in '_-':
            return False
    return True


def parse(text):
    """Script text -> scene dict. Never raises: problems come back in
    scene['errors'] as (line, message), line counted from 1; a scene
    with errors has ok False and must not be played."""
    scene = {'ok': True, 'errors': [], 'outs': [None, None, None, None], 'running_out': -1,
             'cues': [], 'repeat': None, 'idle': [], 'has_idle': False, 'idle_length': 0}
    section = 'top'
    repeat_name = None
    repeat_line = 0
    text = str(text or '')
    raw_lines = text.replace('\r\n', '\n').replace('\r', '\n').split('\n')

    for n, raw in enumerate(raw_lines):
        line_no = n + 1
        words = tokenize(strip_comment(raw).strip())
        if not words:
            continue
        first = words[0][0].lower()
        try:
            if first == 'outs':
                if section != 'top':
                    raise ParseError('"outs" goes at the top, before the first cue')
                names = [s.strip().lower() for s in ' '.join(x[0] for x in words[1:]).split(',')]
                if len(names) > MAX_OUTS:
                    raise ParseError('at most ' + str(MAX_OUTS) + ' outlets')
                for i, name in enumerate(names):
                    if not _valid_outlet_name(name):
                        raise ParseError('"' + name + '" can\'t be an outlet name - use one word, starting with a letter')
                    if name in RESERVED or (len(name) == 4 and name.startswith('out') and name[3] in '1234'):
                        raise ParseError('"' + name + '" is a script word - pick another outlet name')
                    if names.index(name) != i:
                        raise ParseError('"' + name + '" is used twice')
                for i, name in enumerate(names):
                    scene['outs'][i] = name
                scene['running_out'] = names.index('running') if 'running' in names else -1
                continue
            if first == 'cue':
                if section == 'idle':
                    raise ParseError('cues go before "idle:"')
                if section == 'repeat':
                    raise ParseError('"repeat" must come after the last cue')
                cue = _parse_cue(words, len(scene['cues']))
                if cue['name'] and any(c['name'] == cue['name'] for c in scene['cues']):
                    raise ParseError('there\'s already a cue called "' + cue['label'] + '"')
                cue['line'] = line_no
                scene['cues'].append(cue)
                section = 'cue'
                continue
            if first == 'repeat':
                if section == 'idle':
                    raise ParseError('"repeat" goes before "idle:"')
                if section == 'repeat':
                    raise ParseError('only one "repeat"')
                if not scene['cues']:
                    raise ParseError('"repeat" needs cues before it')
                if len(words) > 1:
                    if words[1][0].lower() != 'from' or len(words) < 3:
                        raise ParseError('write it like: repeat, or repeat from NAME')
                    repeat_name = ' '.join(x[0] for x in words[2:]).lower()
                repeat_line = line_no
                scene['repeat'] = 0
                section = 'repeat'
                continue
            if first == 'idle:' or (first == 'idle' and len(words) == 1):
                if scene['has_idle']:
                    raise ParseError('only one "idle:"')
                scene['has_idle'] = True
                section = 'idle'
                continue
            if section == 'top':
                raise ParseError('put this under a cue (a line starting with "cue")')
            if section == 'repeat':
                raise ParseError('nothing can follow "repeat" except "idle:"')
            target = scene['idle'] if section == 'idle' else scene['cues'][-1]['lines']
            if first == 'then':
                if len(words) < 2:
                    raise ParseError('then what? e.g. then lamp to 255 in 2s')
                action = _parse_action(scene, words[1:], True)
                if target:
                    prev = target[-1]
                    if prev['kind'] == 'blink' and prev['duration'] is None:
                        raise ParseError('"then" can\'t follow a blink with no "for" - that blink never ends')
                    action['at'] += line_length(prev)
            else:
                action = _parse_action(scene, words, True)
                # A wait with no time of its own starts with the cue,
                # alongside the lines above it - see SceneScript.js.
                if action['kind'] == 'wait' and not action['has_time'] and target:
                    raise ParseError('this wait starts with the cue, not after the line above - write "then wait ' +
                                     action['written'] + '" (or give it a time, like "2s wait ' + action['written'] + '")')
            action['line'] = line_no
            target.append(action)
        except ParseError as e:
            scene['errors'].append((line_no, e.args[0]))

    if repeat_name is not None:
        target_index = -1
        for i, c in enumerate(scene['cues']):
            if c['name'] == repeat_name:
                target_index = i
        if target_index == -1:
            scene['errors'].append((repeat_line, 'no cue called "' + repeat_name + '"'))
        else:
            scene['repeat'] = target_index

    for cue in scene['cues']:
        _check_overlaps(scene, cue['lines'])
    _check_overlaps(scene, scene['idle'])

    for cue in scene['cues']:
        cue['lines'] = _sort_lines(cue['lines'])
        cue['length'] = max([line_length(l) for l in cue['lines']] or [0])
    for cue in scene['cues']:
        if cue['loop'] and cue['length'] == 0:
            scene['errors'].append((cue['line'], 'this cue takes no time, so its loop would go round instantly - give a ramp a time (in 0.5s) or add a wait'))
    scene['idle'] = _sort_lines(scene['idle'])
    scene['idle_length'] = max([line_length(l) for l in scene['idle']] or [0])

    if scene['repeat'] is not None and not scene['errors']:
        timeless = True
        for c in scene['cues'][scene['repeat']:]:
            t = c['trigger']
            if not (c['length'] == 0 and (t['type'] == 'next' or (t['type'] == 'after' and t['max'] == 0))):
                timeless = False
                break
        if timeless:
            scene['errors'].append((repeat_line, 'this repeat takes no time - give a cue a time, a wait or a "when"'))
    if not scene['cues'] and not scene['errors'] and text.strip():
        scene['errors'].append((1, 'a scene needs at least one cue'))

    scene['errors'] = sorted(scene['errors'], key=lambda e: e[0])
    scene['ok'] = not scene['errors']
    return scene


# ---- running ----

def _is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _to_float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return float('nan')


class Runner:
    """Plays a parsed scene. Time comes from the caller, in ms; every
    event is worked out at the exact time it's due, not at the tick that
    notices it - only "when" (an inlet seen at a tick) depends on ticks.

    ease(curve, side, t): curve is an EASING_NAMES name, side 0 in /
    1 out / 2 in-out. random(): [0, 1), for "after 2s..6s"."""

    def __init__(self, scene, ease, random):
        self.scene = scene
        self._ease = ease
        self._random = random
        self.outputs = [0, 0, 0, 0]
        self.phase = 'idle'   # idle | waiting | playing | stopping | ended
        self.cue_index = -1
        self._ramps = {}
        self._blinks = {}
        self._cue_start = 0
        self._prev_end = 0
        self._wait_until = None
        self._fired = 0
        self._current = None
        self._round = 1
        # Whether in1/in2 were high at the last tick, for "when in1
        # rises/falls"; absent until the first tick. Unwired counts as low.
        self._was_high = {}

    def _cancel(self, out):
        self._ramps.pop(out, None)
        self._blinks.pop(out, None)

    def _advance_to(self, t):
        for k in list(self._ramps.keys()):
            rp = self._ramps[k]
            p = min(1.0, max(0.0, (t - rp['start']) / rp['duration'])) if rp['duration'] > 0 else 1.0
            e = p if rp['ease'] is None else self._ease(rp['ease'][1], rp['ease'][0], p)
            self.outputs[k] = rp['from'] + (rp['to'] - rp['from']) * e
            if p >= 1:
                self.outputs[k] = rp['to']
                del self._ramps[k]
        for k in list(self._blinks.keys()):
            b = self._blinks[k]
            if b['end'] is not None and t >= b['end']:
                self.outputs[k] = b['lo']
                del self._blinks[k]
                continue
            on = ((int((t - b['start']) // b['every']) % 2) == 0) != b['alt']
            self.outputs[k] = b['hi'] if on else b['lo']

    def _fire(self, line, t, instant):
        kind = line['kind']
        if kind == 'set':
            self._cancel(line['out'])
            self.outputs[line['out']] = line['value']
        elif kind == 'ramp':
            out = line['out']
            self._cancel(out)
            current = self.outputs[out]
            start_from = current if _is_num(current) else 0
            if instant or line['duration'] == 0:
                self.outputs[out] = line['to']
            else:
                self._ramps[out] = {'start': t, 'duration': line['duration'], 'from': start_from,
                                    'to': line['to'], 'ease': line['ease']}
        elif kind == 'blink':
            for i, out in enumerate(line['outs']):
                self._cancel(out)
                end = None if (line['duration'] is None or instant) else t + line['duration']
                self._blinks[out] = {'start': t, 'every': line['every'], 'lo': line['lo'], 'hi': line['hi'],
                                     'alt': i == 1, 'end': end}
                if instant and line['duration'] is not None:
                    del self._blinks[out]
                    self.outputs[out] = line['lo']
        # 'wait' does nothing - it only makes the cue longer.

    def _set_running(self):
        ro = self.scene['running_out']
        if ro != -1:
            self.outputs[ro] = 1 if self.phase in ('waiting', 'playing') else 0

    def _enter_cue(self, index, t):
        self.cue_index = index
        self._current = self.scene['cues'][index]
        self._prev_end = t
        self._fired = 0
        trig = self._current['trigger']
        self._wait_until = None
        if trig['type'] == 'after':
            self._wait_until = t + trig['min'] + (trig['max'] - trig['min']) * self._random()
        elif trig['type'] == 'when' and trig['max'] is not None:
            self._wait_until = t + trig['max']
        self.phase = 'waiting'
        if trig['type'] == 'next':
            self._start_cue(t)

    def _start_cue(self, t):
        self.phase = 'playing'
        self._cue_start = t
        self._round = 1

    def _loops_again(self, ins):
        lp = self._current['loop']
        if not lp:
            return False
        if lp['type'] == 'forever':
            return True
        if lp['type'] == 'times':
            return self._round < lp['count']
        return not self._level_met(lp, ins)

    def _end_scene(self, t):
        for k in self._blinks:
            self.outputs[k] = self._blinks[k]['lo']
        self._blinks = {}
        self.phase = 'ended'
        self._current = None
        self._set_running()

    @staticmethod
    def _is_high(inlet, ins):
        v = _to_float(ins.get(inlet) if ins else None)
        threshold = _to_float(ins.get('threshold') if ins else None)
        if threshold != threshold:
            threshold = 512.0
        return v == v and v >= threshold

    def _when_met(self, trig, ins):
        """A waiting cue's "when": a level, or for rises/falls a change
        since the last tick, used up once seen."""
        if trig['level'] in ('high', 'low'):
            return self._level_met(trig, ins)
        was = self._was_high.get(trig['inlet'])
        if was is None:
            return False
        high = self._is_high(trig['inlet'], ins)
        if (not was and high) if trig['level'] == 'rises' else (was and not high):
            self._was_high[trig['inlet']] = high
            return True
        return False

    @staticmethod
    def _level_met(trig, ins):
        v = _to_float(ins.get(trig['inlet']) if ins else None)
        if v != v:
            return False
        threshold = _to_float(ins.get('threshold'))
        if threshold != threshold:
            threshold = 512.0
        return v >= threshold if trig['level'] == 'high' else v < threshold

    def tick(self, now, ins):
        """Bring the scene up to `now` (ms). ins: {in1, in2, threshold}."""
        changes = 0
        while changes < MAX_CUE_CHANGES_PER_TICK:
            if self.phase == 'waiting':
                trig = self._current['trigger']
                if trig['type'] == 'when' and self._when_met(trig, ins):
                    at = self._wait_until if (self._wait_until is not None and self._wait_until < now) else now
                    self._advance_to(at)
                    self._start_cue(at)
                elif self._wait_until is not None and self._wait_until <= now:
                    self._advance_to(self._wait_until)
                    self._start_cue(self._wait_until)
                else:
                    break
            if self.phase not in ('playing', 'stopping'):
                break

            stopping = self.phase == 'stopping'
            lines = self.scene['idle'] if stopping else self._current['lines']
            length = self.scene['idle_length'] if stopping else self._current['length']
            while self._fired < len(lines) and self._cue_start + lines[self._fired]['at'] <= now:
                due = self._cue_start + lines[self._fired]['at']
                self._advance_to(due)
                self._fire(lines[self._fired], due, False)
                self._fired += 1
            if self._fired < len(lines) or self._cue_start + length > now:
                break

            end = self._cue_start + length
            self._advance_to(end)
            changes += 1
            if stopping:
                self.phase = 'idle'
                self.cue_index = -1
                self._current = None
                break
            if self._loops_again(ins):
                self._round += 1
                self._cue_start = end
                self._fired = 0
                continue
            if self.cue_index + 1 < len(self.scene['cues']):
                self._enter_cue(self.cue_index + 1, end)
            elif self.scene['repeat'] is not None:
                self._enter_cue(self.scene['repeat'], end)
            else:
                self._end_scene(end)
                break
        self._advance_to(now)
        self._set_running()
        self._was_high['in1'] = self._is_high('in1', ins)
        self._was_high['in2'] = self._is_high('in2', ins)

    def play(self, now):
        if not self.scene['ok'] or not self.scene['cues']:
            return
        self._advance_to(now)
        self._enter_cue(0, now)
        self._set_running()

    def stop(self, now):
        """Play the idle lines from now; with no idle section, freeze."""
        if self.phase not in ('waiting', 'playing', 'ended'):
            return
        self._advance_to(now)
        if not self.scene['has_idle']:
            self._ramps = {}
            self._blinks = {}
            self.phase = 'idle'
            self.cue_index = -1
            self._current = None
        else:
            self.phase = 'stopping'
            self._cue_start = now
            self._fired = 0
            self._current = None
        self._set_running()

    def apply_idle(self, now):
        """The idle lines at once - for when the patch loads."""
        self._ramps = {}
        self._blinks = {}
        for line in self.scene['idle']:
            self._fire(line, now, True)
        self.phase = 'idle'
        self.cue_index = -1
        self._current = None
        self._advance_to(now)
        self._set_running()

    def skip_wait(self, now):
        if self.phase != 'waiting':
            return
        self._advance_to(now)
        self._start_cue(now)
        self._set_running()

    def status(self, now):
        s = {'phase': self.phase, 'cue': '', 'loop': ''}
        if self.phase in ('waiting', 'playing'):
            s['cue'] = self._current['label']
        if self.phase == 'playing' and self._current['loop']:
            lp = self._current['loop']
            if lp['type'] == 'times':
                s['loop'] = 'loop ' + str(self._round) + ' of ' + str(lp['count'])
            elif lp['type'] == 'until':
                s['loop'] = 'loop ' + str(self._round) + ' until ' + lp['inlet'] + ' ' + lp['level']
            else:
                s['loop'] = 'loop ' + str(self._round)
        return s
