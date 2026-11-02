"""
test/scene-cases.json against the board's Scene port
(firmware/common/scene_script.py), with the interpreter's own easing
curves - the same cases `node test/scene-test.js` runs against NTK's
SceneScript.js. Both must pass:

    python3 -I test/scene_test.py

Like the JS runner, each case runs twice: ticking only at its steps, and
every 7 ms in between, so a result that depends on the tick rate fails.
The status keys 'lines' / 'linesLeft' are NTK's display only - skipped.
"""

import json
import os
import sys
import types

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
# The interpreter imports the board's hardware modules at load time;
# nothing here touches a pin, so empty stand-ins are enough.
for name in ('digitalio', 'analogio', 'pwmio', 'board', 'microcontroller', 'rotaryio'):
    sys.modules.setdefault(name, types.ModuleType(name))
sys.path[:0] = [os.path.join(ROOT, 'firmware', 'common'),
                os.path.join(ROOT, 'firmware', 'xiao-esp32-circuitpython-firmata')]

import scene_script  # noqa: E402
import standalone_interpreter as si  # noqa: E402

SKIPPED_KEYS = ('lines', 'linesLeft')

failures = 0


def fail(name, message):
    global failures
    failures += 1
    print('FAIL ' + name + ': ' + message)


def outlet_index(scene, key):
    if len(key) == 4 and key.startswith('out') and key[3] in '1234':
        return int(key[3]) - 1
    return scene['outs'].index(key) if key in scene['outs'] else -1


def close(a, b):
    num = (int, float)
    if isinstance(a, num) and isinstance(b, num) and not isinstance(a, bool) and not isinstance(b, bool):
        return abs(a - b) < 1e-6
    return a == b


def run_steps(c, scene, tick_every):
    randoms = list(c.get('random', []))
    runner = scene_script.Runner(scene, si.scene_ease, lambda: randoms.pop(0) if randoms else 0)
    ins = {'in1': None, 'in2': None, 'threshold': 512}
    t = 0
    runner.apply_idle(0)
    label = c['name'] + (' (ticking every %dms)' % tick_every if tick_every else '')
    do_names = {'play': 'play', 'stop': 'stop', 'skipWait': 'skip_wait', 'applyIdle': 'apply_idle'}

    for step in c['steps']:
        if tick_every:
            tt = t + tick_every
            while tt < step['t']:
                runner.tick(tt, ins)
                tt += tick_every
        t = step['t']
        if 'in1' in step:
            ins['in1'] = step['in1']
        if 'in2' in step:
            ins['in2'] = step['in2']
        if step.get('do'):
            getattr(runner, do_names[step['do']])(t)
        runner.tick(t, ins)
        status = runner.status(t)
        for key, want in step.get('expect', {}).items():
            if key in SKIPPED_KEYS:
                continue
            if key in ('phase', 'cue', 'loop'):
                got = status[key]
            else:
                index = outlet_index(scene, key)
                if index == -1:
                    fail(label, 'bad expect key ' + key)
                    continue
                got = runner.outputs[index]
            if not close(got, want):
                fail(label, 'at %dms %s = %s, expected %s' % (t, key, json.dumps(got), json.dumps(want)))


def main():
    with open(os.path.join(HERE, 'scene-cases.json')) as f:
        cases = json.load(f)['cases']
    for c in cases:
        scene = scene_script.parse('\n'.join(c['script']))
        got = ['line %d: %s' % e for e in scene['errors']]
        if 'errors' in c:
            if got != c['errors']:
                fail(c['name'], 'errors\n  got:      ' + '\n            '.join(got) +
                     '\n  expected: ' + '\n            '.join(c['errors']))
            continue
        if not scene['ok']:
            fail(c['name'], 'unexpected errors: ' + '; '.join(got))
            continue
        run_steps(c, scene, 0)
        run_steps(c, scene, 7)
    print(('%d failure(s)' % failures) if failures else 'all %d scene cases pass' % len(cases))
    sys.exit(1 if failures else 0)


main()
