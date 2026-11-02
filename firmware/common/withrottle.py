"""
withrottle.py - the board's WiThrottle client, for the standalone
interpreter's DCC Throttle and DCC Function widgets (see
plans/dcc-ex-widgets.md, "On the board (standalone)").

A port of NTK's server/modules/nlHardware/withrottle.js (the protocol)
and WiThrottleModel.js (the session), so a patch drives a train the
same way on the board as it does live in NTK: same lines, same echo
handling, same rate limit, same function toggling. Message formats are
the ones checked against Phil's EX-CSB1 (DCC-EX v5.6.6) in the phase 0
spike.

Two layers, so the protocol can be tested under CPython with no
socket (test/withrottle_test.py):
- Session: lines in -> loco / power state, commands -> lines out
  (self.out). No socket, no clock - every call that needs the time
  is given `now` (time.monotonic() seconds).
- Connection: one Session over one TCP socket. Never blocks the tick
  loop for long: reads are non-blocking, connecting waits at most
  CONNECT_TIMEOUT_S, and a station that's down or full is retried
  every RECONNECT_S for as long as a widget wants a loco - stations
  get switched off and on with the layout.

Shipped compiled (withrottle.mpy, next to standalone_interpreter.mpy)
and only imported when a patch has a DCC widget.
"""

try:
    import errno as _errno
    _NO_DATA = (_errno.EAGAIN, getattr(_errno, 'EWOULDBLOCK', _errno.EAGAIN), getattr(_errno, 'ETIMEDOUT', 116))
except ImportError:
    _NO_DATA = (11, 35, 116)

SEP = '<;>'

CONNECT_TIMEOUT_S = 1.0
# The station accepts a 10th client's TCP connection and then says
# nothing at all (phase 0 spike), so no greeting in time means "full".
GREETING_TIMEOUT_S = 5.0
RECONNECT_S = 5.0
SPEED_INTERVAL_S = 0.1
# How long a value sent is expected back from the station as an echo,
# rather than being someone else's change.
ECHO_S = 2.0
# A function toggle whose echo never came (e.g. a function the loco
# doesn't have) stops blocking new requests after this.
TOGGLE_WAIT_S = 1.5
THROTTLE_IDS = 'T0123456789ABCDEFGHIJ'
MAX_SPEED = 126
# Longer lines (a big roster or turnout list) are dropped - nothing
# here needs them, and they'd only cost memory.
MAX_LINE = 512

# Print every line sent to and received from the station, except
# heartbeats - switched with 'd' on the board's console (see
# StandaloneInterpreter.toggle_dcc_trace).
trace = False


def loco_key(address):
    """Same rule as withrottle.js: S for 1-127, L above; None for
    anything that isn't a usable loco address."""
    try:
        n = float(address)
    except (TypeError, ValueError):
        return None
    if not (1 <= n <= 10239) or n != int(n):
        return None
    n = int(n)
    return ('S' if n <= 127 else 'L') + str(n)


def round_half_up(value):
    """JS's Math.round - Python's round() makes 2.5 into 2, which would
    lose every other 0.5 step."""
    n = int(value)
    if value - n >= 0.5:
        n += 1
    elif n - value > 0.5:
        n -= 1
    return n


def _digits(s):
    return len(s) > 0 and all('0' <= c <= '9' for c in s)


def _is_key(s):
    return s == '*' or (len(s) > 1 and s[0] in 'SL' and _digits(s[1:]))


def _parse_speed(s):
    # V50, V-1, V7.5
    body = s[1:] if s[:1] == '-' else s
    parts = body.split('.')
    if len(parts) > 2 or not all(_digits(p) for p in parts):
        return None
    return float(s)


def parse_line(line):
    """One line from the station -> a list of events (dicts, the same
    shapes as withrottle.js's parseLine - test/withrottle-cases.json
    checks both)."""
    line = str(line or '').strip()
    if line.startswith('VN'):
        return [{'type': 'version', 'value': line[2:]}]
    if line[:1] == '*' and _digits(line[1:]):
        return [{'type': 'heartbeat', 'seconds': int(line[1:])}]
    if len(line) == 4 and line[:3] == 'PPA' and line[3] in '012':
        return [{'type': 'power', 'value': None if line[3] == '2' else int(line[3])}]
    if line[:2] in ('HM', 'Hm'):
        return [{'type': 'message', 'text': line[2:]}]

    if len(line) < 4 or line[0] != 'M' or line[2] not in '+-A':
        return []
    at = line.find(SEP, 3)
    if at == -1:
        return []
    throttle, action, key, rest = line[1], line[2], line[3:at], line[at + len(SEP):]
    if not _is_key(key):
        return []

    if action == '+':
        return [{'type': 'acquired', 'throttle': throttle, 'key': key}]
    if action == '-':
        return [{'type': 'released', 'throttle': throttle, 'key': key}]

    if rest[:1] == 'V':
        speed = _parse_speed(rest[1:])
        if speed is not None:
            return [{'type': 'speed', 'throttle': throttle, 'key': key,
                     'value': 0 if speed < 0 else speed, 'estop': speed < 0}]
    elif len(rest) == 2 and rest[0] == 'R' and rest[1] in '01':
        return [{'type': 'direction', 'throttle': throttle, 'key': key, 'value': int(rest[1])}]
    elif len(rest) > 2 and rest[0] == 'F' and rest[1] in '01' and _digits(rest[2:]):
        return [{'type': 'function', 'throttle': throttle, 'key': key,
                 'fn': int(rest[2:]), 'value': int(rest[1])}]
    return []


# Command lines, client -> station. Same as withrottle.js's commands.
def cmd_hello(name, uid):
    return ['N' + name, 'HU' + uid]


def cmd_power(on):
    return 'PPA' + ('1' if on else '0')


def cmd_acquire(throttle, key):
    return 'M' + throttle + '+' + key + SEP + key


def cmd_release(throttle, key):
    return 'M' + throttle + '-' + key + SEP + 'r'


def cmd_speed(throttle, key, value):
    return 'M' + throttle + 'A' + key + SEP + 'V' + str(int(value))


def cmd_estop(throttle, key):
    return 'M' + throttle + 'A' + key + SEP + 'X'


def cmd_direction(throttle, key, value):
    return 'M' + throttle + 'A' + key + SEP + 'R' + ('1' if value else '0')


def cmd_toggle_function(throttle, key, fn):
    # A press toggles a function on DCC-EX (seen in the spike), so
    # press + release is one toggle.
    return ['M' + throttle + 'A' + key + SEP + 'F1' + str(fn),
            'M' + throttle + 'A' + key + SEP + 'F0' + str(fn)]


class Loco:
    def __init__(self, throttle):
        self.throttle = throttle
        self.wids = set()
        self.acquired = False
        self.acquiring = False
        self.speed = 0
        self.sent_speed = 0
        self.last_speed_at = -1.0
        self.speed_due = False
        self.direction = 1
        self.fns = {}
        self.fn_toggle = {}   # fn -> [at, want, changed]
        self.echoes = []      # [kind, value, at]
        # Bumped on every accepted speed / direction change, with the
        # widget that made it (None = the station: someone else's
        # throttle). A Throttle widget follows changes it didn't make -
        # WiThrottleModel.js's 'change' event, without events.
        self.speed_seq = 0
        self.speed_by = None
        self.direction_seq = 0
        self.direction_by = None


class Session:
    """One WiThrottle session, without a socket - see the module
    docstring. Lines to send collect in self.out."""

    def __init__(self, name='NTK board', uid='NTK-board'):
        self.name = name
        self.uid = uid
        self.locos = {}
        self.out = []
        self.connected = False
        self.greeted = False
        self.power = None
        self.error = None
        self.failed = None     # set when the session must be dropped (no greeting)
        self.heartbeat_s = 10
        self.last_heartbeat = 0.0
        self.greeting_deadline = None

    # ----- session -----

    def start(self, now):
        self.out = cmd_hello(self.name, self.uid)
        self.connected = False
        self.greeted = False
        self.failed = None
        self.greeting_deadline = now + GREETING_TIMEOUT_S

    def lost(self, message=None):
        """The session ended or never started."""
        if message:
            self.error = message
        self.connected = False
        self.greeted = False
        self.greeting_deadline = None
        self.out = []
        for loco in self.locos.values():
            loco.acquired = False
            loco.acquiring = False
            loco.speed_due = False

    def close(self):
        """Stop and release every loco, then quit - the lines are in
        self.out for the Connection to send before it closes."""
        for key in list(self.locos):
            self._release(key)
        if self.connected:
            self.out.append('Q')

    def wanted(self):
        return len(self.locos) > 0

    def tick(self, now):
        if self.greeting_deadline is not None and not self.greeted and now >= self.greeting_deadline:
            self.failed = "isn't answering - it takes at most 9 throttles; is it full?"
            return
        if not self.connected:
            return
        # Half the station's interval, as the protocol asks.
        if now - self.last_heartbeat >= max(1.0, self.heartbeat_s / 2.0):
            self.last_heartbeat = now
            self.out.append('*')
        for key, loco in self.locos.items():
            if loco.speed_due:
                self._send_speed(key, now)

    def receive(self, line, now):
        for event in parse_line(line):
            kind = event['type']
            loco = self.locos.get(event.get('key'))
            if kind == 'version':
                if not self.greeted:
                    self.greeted = True
                    self.connected = True
                    self.error = None
                    self.greeting_deadline = None
                    self.out.append('*+')
                    self.last_heartbeat = now
                    for key in self.locos:
                        self._acquire(key)
            elif kind == 'heartbeat':
                # The station first says *2, then *10 once connected.
                if event['seconds'] > 0:
                    self.heartbeat_s = event['seconds']
            elif kind == 'power':
                self.power = event['value']
            elif loco is None:
                continue
            elif kind == 'acquired':
                loco.acquiring = False
                loco.acquired = True
            elif kind == 'released':
                if loco.acquired and not loco.acquiring:
                    loco.acquired = False
            elif kind == 'speed':
                speed = round_half_up(event['value'])
                if self._is_echo(loco, 'speed', speed, now):
                    continue
                loco.speed = speed
                loco.sent_speed = speed
                loco.speed_due = False
                loco.speed_seq += 1
                loco.speed_by = None
            elif kind == 'direction':
                if not self._is_echo(loco, 'direction', event['value'], now):
                    loco.direction = event['value']
                    loco.direction_seq += 1
                    loco.direction_by = None
            elif kind == 'function':
                self._function_reported(loco, event['key'], event['fn'], event['value'], now)

    # ----- what widgets call -----

    def want(self, key, wid):
        """A widget wants a loco - shared with any other widget on it,
        released once none want it."""
        loco = self.locos.get(key)
        if loco is None:
            used = [l.throttle for l in self.locos.values()]
            throttle = 'T'
            for c in THROTTLE_IDS:
                if c not in used:
                    throttle = c
                    break
            loco = self.locos[key] = Loco(throttle)
        loco.wids.add(wid)
        if self.connected and not loco.acquired and not loco.acquiring:
            self._acquire(key)
        return loco

    def drop(self, key, wid, stop=False, now=0.0):
        loco = self.locos.get(key)
        if loco is None or wid not in loco.wids:
            return
        loco.wids.discard(wid)
        if not loco.wids:
            self._release(key)
        # A Throttle switched off stops its train even while a DCC
        # Function still holds the loco (WiThrottleModel.js).
        elif stop:
            self._stop(key, now)

    def set_power(self, on):
        if self.connected:
            self.out.append(cmd_power(on))

    def set_speed(self, key, value, now, wid=None):
        loco = self.locos.get(key)
        if loco is None:
            return
        speed = max(0, min(MAX_SPEED, round_half_up(value)))
        if speed != loco.speed:
            loco.speed = speed
            loco.speed_seq += 1
            loco.speed_by = wid
        self._send_speed(key, now)

    def set_direction(self, key, forward, now, wid=None):
        loco = self.locos.get(key)
        if loco is None:
            return
        direction = 1 if forward else 0
        if direction == loco.direction:
            return
        loco.direction = direction
        loco.direction_seq += 1
        loco.direction_by = wid
        if self._can_drive(loco):
            self._expect_echo(loco, 'direction', direction, now)
            self.out.append(cmd_direction(loco.throttle, key, direction))

    def estop(self, key, now, wid=None):
        loco = self.locos.get(key)
        if loco is None:
            return
        loco.speed_due = False
        loco.speed = 0
        loco.sent_speed = 0
        loco.speed_seq += 1
        loco.speed_by = wid
        if self._can_drive(loco):
            loco.last_speed_at = now
            self._expect_echo(loco, 'speed', 0, now)
            self.out.append(cmd_estop(loco.throttle, key))

    def set_function(self, key, fn, on, now):
        """DCC-EX only offers "press" (which toggles), so setting a
        function means toggling it when it's not already as wanted, and
        waiting for the station's report before toggling again."""
        loco = self.locos.get(key)
        if loco is None or not self._can_drive(loco):
            return
        on = 1 if on else 0
        pending = loco.fn_toggle.get(fn)
        if pending is not None and now - pending[0] < TOGGLE_WAIT_S:
            if pending[1] != on:
                pending[1] = on
                pending[2] = True
            return
        if loco.fns.get(fn, 0) == on:
            return
        loco.fn_toggle[fn] = [now, on, False]
        self.out.extend(cmd_toggle_function(loco.throttle, key, fn))

    # ----- locos -----

    def _can_drive(self, loco):
        return self.connected and loco.acquired

    def _acquire(self, key):
        loco = self.locos[key]
        loco.acquiring = True
        loco.echoes = []
        self.out.append(cmd_acquire(loco.throttle, key))

    def _release(self, key):
        """Stop the loco and give it back to the station. A plain stop,
        not an E-stop, so a loco with momentum slows down normally."""
        loco = self.locos.pop(key, None)
        if loco is not None and self._can_drive(loco):
            if loco.sent_speed != 0:
                self.out.append(cmd_speed(loco.throttle, key, 0))
            self.out.append(cmd_release(loco.throttle, key))

    def _stop(self, key, now):
        loco = self.locos[key]
        loco.speed_due = False
        if loco.speed != 0:
            loco.speed = 0
            loco.speed_seq += 1
            loco.speed_by = None
        if self._can_drive(loco) and loco.sent_speed != 0:
            loco.sent_speed = 0
            loco.last_speed_at = now
            self._expect_echo(loco, 'speed', 0, now)
            self.out.append(cmd_speed(loco.throttle, key, 0))

    def _send_speed(self, key, now):
        """Latest speed, at most every SPEED_INTERVAL_S, nothing for an
        unchanged one. A speed held back is sent from tick()."""
        loco = self.locos[key]
        loco.speed_due = False
        if not self._can_drive(loco) or loco.speed == loco.sent_speed:
            return
        if now - loco.last_speed_at < SPEED_INTERVAL_S:
            loco.speed_due = True
            return
        loco.sent_speed = loco.speed
        loco.last_speed_at = now
        self._expect_echo(loco, 'speed', loco.speed, now)
        self.out.append(cmd_speed(loco.throttle, key, loco.speed))

    # The station echoes every V / R straight back. Those echoes mustn't
    # count as someone else's change: with a fast stream of speeds, the
    # echo of an older one arriving would otherwise pull the speed back.
    def _expect_echo(self, loco, kind, value, now):
        loco.echoes.append([kind, value, now])

    def _is_echo(self, loco, kind, value, now):
        loco.echoes = [e for e in loco.echoes if now - e[2] < ECHO_S]
        mine = [e for e in loco.echoes if e[0] == kind]
        index = -1
        for i, e in enumerate(mine):
            if e[1] == value:
                index = i
                break
        # Drop this kind's expected echoes up to the one that came back
        # - or all of them, if this was someone else's change.
        drop = mine if index == -1 else mine[:index + 1]
        loco.echoes = [e for e in loco.echoes if not any(e is d for d in drop)]
        return index != -1

    def _function_reported(self, loco, key, fn, on, now):
        loco.fns[fn] = on
        pending = loco.fn_toggle.pop(fn, None)
        # Asked for something else while the toggle was on its way.
        # Only then - a momentary function reports on, then off, by
        # itself, and chasing that would toggle forever.
        if pending is not None and pending[1] != on and pending[2]:
            self.set_function(key, fn, pending[1], now)


class Connection:
    """One Session over TCP. `pool` is a socketpool.SocketPool on the
    board, or CPython's socket module in tests - both have
    pool.socket(pool.AF_INET, pool.SOCK_STREAM)."""

    def __init__(self, pool, host, port, session, label=None):
        self.pool = pool
        self.host = host
        self.port = port
        self.session = session
        self.label = label or '%s:%d' % (host, port)
        self.sock = None
        self.retry_at = 0.0
        self.closed = False
        self._rx = b''
        self._skipping = False
        self._tx = b''
        self._buf = bytearray(256)
        self._said = None

    def _say(self, text):
        # Only on a change, so a station that's down doesn't fill the
        # console every few seconds.
        if text != self._said:
            self._said = text
            print('DCC:', text)

    def poll(self, now):
        session = self.session
        if self.closed:
            return
        if self.sock is None:
            if session.wanted() and now >= self.retry_at:
                self._connect(now)
            if self.sock is None:
                return
        self._read(now)
        if self.sock is None:
            return
        session.tick(now)
        if session.failed:
            self._drop(session.failed, now)
            return
        if session.connected and self._said != 'connected to ' + self.label:
            self._say('connected to ' + self.label)
        self._write()

    def _connect(self, now):
        self.retry_at = now + RECONNECT_S
        sock = None
        try:
            sock = self.pool.socket(self.pool.AF_INET, self.pool.SOCK_STREAM)
            sock.settimeout(CONNECT_TIMEOUT_S)
            sock.connect((self.host, self.port))
            sock.settimeout(0)
        except Exception as e:
            if sock is not None:
                try:
                    sock.close()
                except Exception:
                    pass
            code = getattr(e, 'errno', None)
            message = "can't reach %s (%s)" % (self.label, code if code is not None else e)
            self.session.lost(message)
            self._say(message + ' - trying again every %ds' % RECONNECT_S)
            return
        self.sock = sock
        self._rx = b''
        self._skipping = False
        self._tx = b''
        self.session.start(now)

    def _drop(self, message, now):
        if self.sock is not None:
            try:
                self.sock.close()
            except Exception:
                pass
        self.sock = None
        self.retry_at = now + RECONNECT_S
        self.session.lost(message)
        self._say('%s %s - trying again every %ds' % (self.label, message, RECONNECT_S))

    def _read(self, now):
        while True:
            try:
                n = self.sock.recv_into(self._buf)
            except OSError as e:
                if getattr(e, 'errno', None) in _NO_DATA:
                    return
                self._drop('connection lost (%s)' % getattr(e, 'errno', e), now)
                return
            if n == 0:
                self._drop('closed the connection', now)
                return
            self._rx += bytes(self._buf[:n])
            while True:
                at = self._rx.find(b'\n')
                if at == -1:
                    break
                line, self._rx = self._rx[:at], self._rx[at + 1:]
                if self._skipping:
                    self._skipping = False
                    continue
                line = line.strip()
                if line:
                    try:
                        if trace and line != b'*10':
                            print('DCC <', line.decode())
                        self.session.receive(line.decode(), now)
                    except UnicodeError:
                        pass
            if len(self._rx) > MAX_LINE:
                self._rx = b''
                self._skipping = True
            if n < len(self._buf):
                return

    def _write(self):
        session = self.session
        if session.out:
            if trace:
                for line in session.out:
                    if line != '*':
                        print('DCC >', line)
            self._tx += ('\n'.join(session.out) + '\n').encode()
            session.out = []
        while self._tx:
            try:
                n = self.sock.send(self._tx)
            except OSError as e:
                if getattr(e, 'errno', None) in _NO_DATA:
                    return
                self._drop('connection lost (%s)' % getattr(e, 'errno', e), 0.0)
                return
            if not n:
                return
            self._tx = self._tx[n:]

    def close(self):
        """Stop and release this board's locos and quit the session,
        then close the socket - before NTK takes over the board."""
        self.closed = True
        if self.sock is None:
            return
        self.session.close()
        try:
            self.sock.settimeout(CONNECT_TIMEOUT_S)
        except Exception:
            pass
        self._write()
        try:
            self.sock.close()
        except Exception:
            pass
        self.sock = None
        self.session.lost()
        self._said = None
