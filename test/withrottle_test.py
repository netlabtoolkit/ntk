"""
The board's WiThrottle client (firmware/common/withrottle.py) and the
standalone interpreter's DCC Throttle / DCC Function, under CPython -
no board, no station:

    python3 -I test/withrottle_test.py

A fake DCC-EX station (a port of withrottle.js's simulated station)
listens on a local TCP port, so the real Connection code - sockets,
non-blocking reads, reconnecting - is what's tested, not a mock of it.
"""

import json
import os
import socket
import sys
import threading
import time
import types

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
# The interpreter imports the board's hardware modules at load time;
# nothing here touches a pin, so empty stand-ins are enough.
for name in ('digitalio', 'analogio', 'pwmio', 'board', 'microcontroller', 'rotaryio'):
    sys.modules.setdefault(name, types.ModuleType(name))
sys.path[:0] = [os.path.join(ROOT, 'firmware', 'common'),
                os.path.join(ROOT, 'firmware', 'xiao-esp32-circuitpython-firmata')]

import withrottle as wt  # noqa: E402
import standalone_interpreter as si  # noqa: E402

SEP = wt.SEP
failures = 0


def check(name, fn):
    global failures
    try:
        fn()
        print('ok   ' + name)
    except Exception as e:
        failures += 1
        print('FAIL ' + name + '\n     ' + repr(e))


def eq(a, b, what=''):
    if a != b:
        raise AssertionError('%s: %r != %r' % (what, a, b))


# ----- the fake station: withrottle.js's createSimulatedStation -----

class FakeStation:
    FUNCTION_COUNT = 29

    def __init__(self):
        self.power = 0
        self.locos = {}
        self.clients = []
        self.lock = threading.RLock()
        self.silent = False   # a full station: accepts, never answers

    def loco(self, key):
        if key not in self.locos:
            self.locos[key] = {'speed': 0, 'estop': False, 'direction': 1, 'fns': [0] * self.FUNCTION_COUNT}
        return self.locos[key]

    def connect(self, send):
        client = {'send': send, 'held': {}, 'log': []}
        with self.lock:
            self.clients.append(client)
            if not self.silent:
                for line in ('VN2.0', 'RL0', 'PPA%d' % self.power, 'PTL', '*10'):
                    send(line)
        return client

    def close(self, client):
        with self.lock:
            if client in self.clients:
                self.clients.remove(client)

    def _speed_text(self, l):
        return 'V-1' if l['estop'] else 'V%d' % l['speed']

    def _to_holders(self, key, rest):
        for c in self.clients:
            for throttle, held in c['held'].items():
                if key in held:
                    c['send']('M' + throttle + 'A' + key + SEP + rest)

    def _act(self, key, rest):
        l = self.loco(key)
        if rest.startswith('V'):
            l['speed'] = max(0, min(126, int(float(rest[1:]) + 0.5)))
            l['estop'] = False
            self._to_holders(key, self._speed_text(l))
        elif rest == 'X':
            l['speed'], l['estop'] = 0, True
            self._to_holders(key, self._speed_text(l))
        elif rest in ('R0', 'R1'):
            l['direction'] = int(rest[1])
            self._to_holders(key, 'R%d' % l['direction'])
        elif rest.startswith('F1'):
            fn = int(rest[2:])
            if fn < self.FUNCTION_COUNT:
                l['fns'][fn] = 0 if l['fns'][fn] else 1
                self._to_holders(key, 'F%d%d' % (l['fns'][fn], fn))

    def receive(self, client, line):
        with self.lock:
            client['log'].append(line)
            send = client['send']
            if line in ('PPA0', 'PPA1'):
                self.power = int(line[3])
                for c in self.clients:
                    c['send']('PPA%d' % self.power)
                return
            if len(line) < 4 or line[0] != 'M' or SEP not in line:
                return
            throttle, action = line[1], line[2]
            key, rest = line[3:].split(SEP, 1)
            held = client['held'].setdefault(throttle, [])
            if action == '+':
                if key not in held:
                    held.append(key)
                l = self.loco(key)
                send('M' + throttle + '+' + key + SEP)
                for fn, on in enumerate(l['fns']):
                    send('M%sA%s%sF%d%d' % (throttle, key, SEP, on, fn))
                send('M' + throttle + 'A' + key + SEP + self._speed_text(l))
                send('M' + throttle + 'A' + key + SEP + 'R%d' % l['direction'])
            elif action == '-':
                if key in held:
                    held.remove(key)
                send('M' + throttle + '-' + key + SEP)
            elif key == '*':
                for k in list(held):
                    self._act(k, rest)
            elif key in held:
                self._act(key, rest)


class StationServer:
    """FakeStation on a local TCP port, one thread per client."""

    def __init__(self, station):
        self.station = station
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.sock.bind(('127.0.0.1', 0))
        self.sock.listen(5)
        self.port = self.sock.getsockname()[1]
        self.logs = []
        self.running = True
        threading.Thread(target=self._accept, daemon=True).start()

    def _accept(self):
        while self.running:
            try:
                conn, _ = self.sock.accept()
            except OSError:
                return
            threading.Thread(target=self._serve, args=(conn,), daemon=True).start()

    def _serve(self, conn):
        def send(line):
            try:
                conn.sendall((line + '\n').encode())
            except OSError:
                pass
        client = self.station.connect(send)
        self.logs.append(client['log'])
        buf = b''
        try:
            while True:
                data = conn.recv(1024)
                if not data:
                    break
                buf += data
                while b'\n' in buf:
                    line, buf = buf.split(b'\n', 1)
                    if line.strip():
                        self.station.receive(client, line.decode().strip())
        except OSError:
            pass
        self.station.close(client)
        conn.close()

    def stop(self):
        self.running = False
        self.sock.close()


def run_until(condition, tick, seconds=3.0):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        tick()
        if condition():
            return True
        time.sleep(0.01)
    return False


# ----- protocol: the cases NTK's withrottle-test.js checks too -----

CASES = json.load(open(os.path.join(HERE, 'withrottle-cases.json')))
COMMANDS = {
    'hello': wt.cmd_hello, 'power': wt.cmd_power, 'acquire': wt.cmd_acquire,
    'release': wt.cmd_release, 'speed': wt.cmd_speed, 'estop': wt.cmd_estop,
    'direction': wt.cmd_direction, 'toggleFunction': wt.cmd_toggle_function,
}


def shared_cases():
    for c in CASES['locoKeys']:
        eq(wt.loco_key(c['address']), c['key'], c['address'])
    for c in CASES['parse']:
        eq(wt.parse_line(c['line']), c['events'], c['line'])
    for c in CASES['commands']:
        lines = COMMANDS[c['name']](*c['args'])
        eq(lines if isinstance(lines, list) else [lines], c['lines'], c['name'])


check('shared cases (test/withrottle-cases.json)', shared_cases)

check('half-up rounding, like Math.round', lambda: eq(
    [wt.round_half_up(v) for v in (0.5, 1.5, 2.5, 2.49, 125.5)], [1, 2, 3, 2, 126]))


# ----- Session, against the fake station with no socket -----

class Pair:
    """A Session wired straight to a FakeStation client."""

    def __init__(self, station=None):
        self.station = station or FakeStation()
        self.session = wt.Session('test', 'test-1')
        self.inbox = []
        self.client = None
        self.now = 100.0

    def start(self):
        self.session.start(self.now)
        self.client = self.station.connect(self.inbox.append)
        self.pump()

    def pump(self, seconds=0.0):
        self.now += seconds
        for _ in range(20):
            self.session.tick(self.now)
            out, self.session.out = self.session.out, []
            for line in out:
                self.station.receive(self.client, line)
            inbox, self.inbox[:] = list(self.inbox), []
            for line in inbox:
                self.session.receive(line, self.now)
            if not out and not inbox:
                return


def session_acquires():
    p = Pair()
    p.station.loco('S3')['speed'] = 40
    loco = p.session.want('S3', 'w1')
    p.start()
    eq(p.session.connected, True, 'connected')
    eq(loco.acquired, True, 'acquired')
    eq(loco.speed, 40, 'takes the station\'s speed')
    eq(loco.speed_by, None, 'reported by the station')
    eq(p.client['log'][:3], ['Ntest', 'HUtest-1', '*+'], 'opening lines')


def session_rate_limit_and_echo():
    p = Pair()
    loco = p.session.want('S3', 'w1')
    p.start()
    seq = loco.speed_seq
    p.session.set_speed('S3', 10, p.now, 'w1')
    p.session.set_speed('S3', 11, p.now, 'w1')
    p.session.set_speed('S3', 12, p.now, 'w1')
    p.pump()
    eq([l for l in p.client['log'] if 'V' in l], ['MTAS3<;>V10'], 'one speed within 100 ms')
    p.pump(0.15)
    eq([l for l in p.client['log'] if 'V' in l], ['MTAS3<;>V10', 'MTAS3<;>V12'], 'then the latest')
    eq(loco.speed, 12, 'echo of 10 didn\'t pull the speed back')
    eq(loco.speed_by, 'w1', 'still this widget\'s change')
    eq(loco.speed_seq, seq + 3, 'three changes')


def session_remote_change():
    p = Pair()
    loco = p.session.want('S3', 'w1')
    p.start()
    phone = p.station.connect(lambda line: None)
    p.station.receive(phone, 'MP+S3<;>S3')
    p.station.receive(phone, 'MPAS3<;>V77')
    p.station.receive(phone, 'MPAS3<;>R0')
    p.pump()
    eq((loco.speed, loco.direction, loco.speed_by), (77, 0, None), 'follows another throttle')


def session_functions():
    p = Pair()
    loco = p.session.want('S3', 'w1')
    p.start()
    p.session.set_function('S3', 0, True, p.now)
    p.session.set_function('S3', 0, True, p.now)   # already asked
    p.pump()
    eq(loco.fns[0], 1, 'F0 on')
    eq([l for l in p.client['log'] if 'F' in l], ['MTAS3<;>F10', 'MTAS3<;>F00'], 'one press + release')
    p.session.set_function('S3', 0, True, p.now)
    p.pump()
    eq(len([l for l in p.client['log'] if 'F' in l]), 2, 'nothing for a function already on')
    # Asked for off and on again while the toggle is on its way - only
    # the last wish counts once the report arrives.
    p.session.set_function('S3', 1, True, p.now)
    p.session.set_function('S3', 1, False, p.now)
    p.pump()
    eq(loco.fns[1], 0, 'F1 back off')


def session_release_and_stop():
    p = Pair()
    p.session.want('S3', 'throttle')
    p.session.want('S3', 'function')
    p.start()
    p.session.set_speed('S3', 30, p.now, 'throttle')
    p.pump()
    p.session.drop('S3', 'throttle', stop=True, now=p.now + 1)
    p.pump(1)
    eq(p.station.loco('S3')['speed'], 0, 'a Throttle let go stops the train')
    eq('S3' in p.session.locos, True, 'the Function still holds it')
    p.session.drop('S3', 'function', now=p.now)
    p.pump()
    eq(p.client['log'][-1], 'MT-S3<;>r', 'released once nobody wants it')


def session_close():
    p = Pair()
    p.session.want('S3', 'w1')
    p.start()
    p.session.set_speed('S3', 50, p.now, 'w1')
    p.pump()
    p.session.close()
    eq(p.session.out, ['MTAS3<;>V0', 'MT-S3<;>r', 'Q'], 'stop, release, quit')


def session_full_station():
    station = FakeStation()
    station.silent = True
    p = Pair(station)
    p.session.want('S3', 'w1')
    p.start()
    p.pump(wt.GREETING_TIMEOUT_S + 0.1)
    eq(bool(p.session.failed and 'full' in p.session.failed), True, 'no greeting = full')


def session_heartbeat():
    p = Pair()
    p.session.want('S3', 'w1')
    p.start()
    p.pump(5.1)
    eq(p.client['log'].count('*'), 1, 'heartbeat at half of *10')


check('session takes the loco and the station\'s state', session_acquires)
check('speed is rate-limited, its echoes ignored', session_rate_limit_and_echo)
check('another throttle\'s change is followed', session_remote_change)
check('functions are set by toggling', session_functions)
check('switching a Throttle off stops it, release when nobody wants it', session_release_and_stop)
check('closing stops, releases and quits', session_close)
check('a station that never greets is "full"', session_full_station)
check('heartbeat follows the station\'s interval', session_heartbeat)


# ----- the interpreter, a handheld patch, over TCP -----

def handheld_patch(port):
    """Encoder -> DCC Throttle step; OSCIn stand-ins (no OSC mapping, so
    no sockets - their in passes straight to out) for a stop button and
    a headlight switch."""
    station = {'stationHost': '127.0.0.1', 'stationPort': port, 'loco': 3, 'active': True}
    widgets = [
        {'wid': 'enc', 'typeID': 'Encoder', 'step': '1.5', 'min': 0, 'max': 1023, 'edgesPerClick': 1, 'count': 0, 'delta': 0},
        {'wid': 'thr', 'typeID': 'DCCThrottle', 'title': 'DCC Throt', 'inMin': 0, 'inMax': 126,
         'inSpeed': '--', 'inStep': 0, 'inDirection': '--', 'inStop': '--', 'speed': 0, 'direction': 1},
        {'wid': 'stop', 'typeID': 'OSCIn', 'in': 0},
        {'wid': 'light', 'typeID': 'OSCIn', 'in': 0},
        {'wid': 'fn', 'typeID': 'DCCFunction', 'title': 'DCC Func', 'fn': 0, 'toggle': False, 'in': '--', 'state': 0},
        {'wid': 'off', 'typeID': 'DCCFunction', 'title': 'off one', 'fn': 1, 'toggle': False, 'in': 1, 'state': 0},
    ]
    for w in widgets:
        if w['typeID'].startswith('DCC'):
            w.update(station)
    widgets[-1]['active'] = False
    link = {'sourceField': 'station', 'destinationField': 'stationLink'}
    mappings = [
        {'modelWID': 'enc', 'viewWID': 'thr', 'map': {'sourceField': 'delta', 'destinationField': 'inStep'}},
        {'modelWID': 'stop', 'viewWID': 'thr', 'map': {'sourceField': 'out', 'destinationField': 'inStop'}},
        {'modelWID': 'light', 'viewWID': 'fn', 'map': {'sourceField': 'out', 'destinationField': 'in'}},
        {'modelWID': 'WiThrottle:127.0.0.1:%d' % port, 'viewWID': 'thr', 'map': link},
        {'modelWID': 'WiThrottle:127.0.0.1:%d' % port, 'viewWID': 'fn', 'map': link},
    ]
    return {'widgets': widgets, 'mappings': mappings}


def interpreter_handheld():
    station = FakeStation()
    station.power = 1
    server = StationServer(station)
    try:
        interp = si.StandaloneInterpreter([])
        interp._dcc_pool = socket
        eq(interp.load(handheld_patch(server.port)), True, 'loads')
        interp.claim_hardware()
        values = lambda wid: interp.widgets[wid]['values']
        tick = interp.tick
        loco = lambda: station.loco('S3')

        eq(run_until(lambda: len(server.logs) == 1 and any(l.startswith('MT+S3') for l in server.logs[0]), tick), True, 'acquires loco 3')
        eq(len(server.logs), 1, 'one session for both widgets')
        eq(values('thr')['address'], 3, 'address outlet')

        # Encoder: three clicks of 1.5 = 1.5, 3, 4.5 -> 2, 3, 5 (half up).
        # The first reading is the Encoder's baseline, as on the board.
        values('enc')['in'] = 0
        tick()
        sent = []
        for position in (1, 2, 3):
            values('enc')['in'] = position
            run_until(lambda: False, tick, 0.25)   # the Encoder holds each step 200 ms
            sent.append(loco()['speed'])
        eq(sent, [2, 3, 5], 'fractional steps reach the station')
        eq(values('thr')['speed'], 5, 'speed outlet')

        # Someone else's throttle sets 40; the next click starts there.
        phone = station.connect(lambda line: None)
        station.receive(phone, 'MP+S3<;>S3')
        station.receive(phone, 'MPAS3<;>V40')
        eq(run_until(lambda: values('thr')['speed'] == 40, tick), True, 'follows the phone')
        values('enc')['in'] = 4
        eq(run_until(lambda: loco()['speed'] == 42, tick), True, 'step from the phone\'s speed (40 + 1.5 -> 42)')

        # Headlight switch, following.
        values('light')['in'] = 1
        eq(run_until(lambda: loco()['fns'][0] == 1 and values('fn')['state'] == 1, tick), True, 'F0 follows the switch on')
        values('light')['in'] = 0
        eq(run_until(lambda: loco()['fns'][0] == 0 and values('fn')['state'] == 0, tick), True, 'and off')
        eq(loco()['fns'][1], 0, 'a switched-off Function does nothing')

        # Stop button: rising edge = E-stop.
        values('stop')['in'] = 1
        eq(run_until(lambda: loco()['estop'], tick), True, 'stop inlet E-stops')
        eq(values('thr')['speed'], 0, 'speed outlet 0 after E-stop')

        # Monitor mode sees the outlets.
        eq(dict(interp.monitor_fields('thr')).get('speed'), 0, 'monitor sees speed')

        # NTK takes over the board: stop, release, quit.
        values('enc')['in'] = 10
        run_until(lambda: loco()['speed'] > 0, tick)
        interp.release_hardware()
        eq(run_until(lambda: server.logs[0][-1:] == ['Q'], lambda: None), True, 'quits the session')
        eq(loco()['speed'], 0, 'train stopped on handoff')
        eq(server.logs[0][-2], 'MT-S3<;>r', 'loco released on handoff')

        # NTK lets go: the board connects again, a new session.
        interp.claim_hardware()
        eq(run_until(lambda: len(server.logs) == 2 and any(l.startswith('MT+S3') for l in server.logs[1]), tick), True, 'reconnects after handoff')
        interp.release_hardware()
    finally:
        server.stop()


def interpreter_station_down():
    # Nothing listening on this port: the patch keeps ticking, and the
    # board connects once the station is up.
    probe = socket.socket()
    probe.bind(('127.0.0.1', 0))
    port = probe.getsockname()[1]
    probe.close()

    interp = si.StandaloneInterpreter([])
    interp._dcc_pool = socket
    interp.load(handheld_patch(port))
    interp.claim_hardware()
    started = time.monotonic()
    for _ in range(50):
        interp.tick()
    eq(time.monotonic() - started < 1.5, True, 'ticking isn\'t held up')

    station = FakeStation()
    server = StationServer.__new__(StationServer)
    server.station, server.logs, server.running = station, [], True
    server.sock = socket.socket()
    server.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.sock.bind(('127.0.0.1', port))
    server.sock.listen(5)
    threading.Thread(target=server._accept, daemon=True).start()
    try:
        connection = list(interp._dcc_connections.values())[0]
        connection.retry_at = 0   # don't wait the full RECONNECT_S here
        eq(run_until(lambda: connection.session.connected, interp.tick), True, 'connects once the station is up')
        interp.release_hardware()
    finally:
        server.stop()


def interpreter_simulated_host():
    patch = handheld_patch(2560)
    for w in patch['widgets']:
        if w['typeID'].startswith('DCC'):
            w['stationHost'] = 'simulated'
    interp = si.StandaloneInterpreter([])
    interp._dcc_pool = socket
    interp.load(patch)
    interp.claim_hardware()
    interp.tick()
    eq(interp._dcc_connections, {}, 'no connection for the NTK-only simulated station')


def interpreter_exit_stops():
    # Ctrl-C on the board: ntk_firmata_main.run() calls release_dcc().
    station = FakeStation()
    station.power = 1
    server = StationServer(station)
    try:
        interp = si.StandaloneInterpreter([])
        interp._dcc_pool = socket
        interp.load(handheld_patch(server.port))
        interp.claim_hardware()
        connection = list(interp._dcc_connections.values())[0]
        eq(run_until(lambda: connection.session.locos['S3'].acquired, interp.tick), True, 'acquires')
        enc = interp.widgets['enc']['values']
        enc['in'] = 0
        interp.tick()
        enc['in'] = 20
        eq(run_until(lambda: station.loco('S3')['speed'] > 0, interp.tick), True, 'train running')
        interp.release_dcc()
        eq(run_until(lambda: server.logs[0][-1:] == ['Q'], lambda: None), True, 'quits the session')
        eq(station.loco('S3')['speed'], 0, 'train stopped')
        interp.release_dcc()   # again, with nothing open
    finally:
        server.stop()


check('handheld patch: encoder, phone, headlight, stop, handoff', interpreter_handheld)
check('exiting the firmware stops the train', interpreter_exit_stops)
check('station down: ticking goes on, connects later', interpreter_station_down)
check('"simulated" doesn\'t connect on a board', interpreter_simulated_host)

print('%d failed' % failures if failures else 'all board WiThrottle checks pass')
sys.exit(1 if failures else 0)
