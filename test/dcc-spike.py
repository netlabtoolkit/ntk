#!/usr/bin/env python3
"""DCC-EX / WiThrottle spike (phase 0 of plans/dcc-ex-widgets.md).

Talks to a DCC-EX command station over WiFi, standard library only.
Every line sent is printed as '>>' and every line received as '<<',
with the time since start, so the real message formats are visible.

Usage:  python3 test/dcc-spike.py HOST STEP [args]

  listen [secs]          connect and print what the station announces (default 10 s)
  power on|off           track power
  drive ADDR [speed]     run a loco slowly forward, then reverse, headlight on/off, stop
  heartbeat ADDR         run a loco slowly, then stop sending the heartbeat:
                         does the station stop the loco by itself?
  frac ADDR [secs]       blink the headlight 3 times, then send speed 7.5 (default 5 s), then stop
  turnout ID             throw, then close, a turnout defined on the station
  clients [max]          open sessions until the station refuses one (default max 20)
  native [CMD ...]       DCC-EX <...> commands on their own socket (default <s> and <JT>)

The port is 2560 unless HOST is given as host:port. A loco this script
drives is E-stopped and released on exit, including Ctrl-C.
"""

import socket
import sys
import threading
import time

T0 = time.time()
HEARTBEAT_S = 5


def log(tag, line):
    print('%6.2f %s %s' % (time.time() - T0, tag, line), flush=True)


class Session:
    """One WiThrottle client connection, with a reader thread and a heartbeat."""

    def __init__(self, host, port, name='NTK-spike', ident=None, quiet=False):
        self.quiet = quiet
        self.sock = socket.create_connection((host, port), timeout=5)
        self.sock.settimeout(0.5)
        self.lines = []
        self.alive = True
        self.heartbeat_on = False
        self.locos = set()
        self.reader = threading.Thread(target=self._read, daemon=True)
        self.reader.start()
        self.send('N' + name)
        self.send('HU' + (ident or 'ntkspike%d' % int(time.time() * 1000)))

    def send(self, line):
        if not self.quiet:
            log('>>', line)
        self.sock.sendall((line + '\n').encode())

    def _read(self):
        buf = b''
        while self.alive:
            try:
                data = self.sock.recv(1024)
            except socket.timeout:
                self._beat()
                continue
            except OSError:
                break
            if not data:
                if not self.quiet:
                    log('--', 'station closed the connection')
                self.alive = False
                break
            buf += data
            while b'\n' in buf:
                raw, buf = buf.split(b'\n', 1)
                line = raw.decode(errors='replace').strip()
                if line:
                    self.lines.append(line)
                    if not self.quiet:
                        log('<<', line)
            self._beat()

    def _beat(self):
        now = time.time()
        if self.heartbeat_on and now - getattr(self, 'last_beat', 0) >= HEARTBEAT_S:
            self.last_beat = now
            try:
                self.send('*')
            except OSError:
                pass

    def start_heartbeat(self):
        self.send('*+')
        self.heartbeat_on = True
        self.last_beat = time.time()

    def wait_for(self, prefix, secs=3):
        """Wait until a line starting with prefix arrives; return it or None."""
        start = len(self.lines)
        end = time.time() + secs
        while time.time() < end:
            for line in self.lines[start:]:
                if line.startswith(prefix):
                    return line
            time.sleep(0.05)
        return None

    def close(self):
        for key in list(self.locos):
            try:
                self.send('MTA%s<;>X' % key)
                self.send('MT-%s<;>r' % key)
            except OSError:
                pass
        try:
            self.send('Q')
        except OSError:
            pass
        time.sleep(0.3)
        self.alive = False
        self.sock.close()


def loco_key(addr):
    # DCC-EX uses short addresses for 1-127, long above
    addr = int(addr)
    return ('S%d' if addr <= 127 else 'L%d') % addr


def acquire(s, addr):
    key = loco_key(addr)
    s.send('MT+%s<;>%s' % (key, key))
    s.locos.add(key)
    if not s.wait_for('MT+' + key, 3):
        log('!!', 'no acquire reply for ' + key)
    time.sleep(0.5)  # let the function labels / state arrive
    return key


def throttle(s, key, cmd):
    s.send('MTA%s<;>%s' % (key, cmd))


def step_listen(s, secs=10):
    s.start_heartbeat()
    time.sleep(float(secs))


def step_power(s, state):
    s.start_heartbeat()
    s.send('PPA%d' % (1 if state == 'on' else 0))
    reply = s.wait_for('PPA', 3)
    log('==', 'power reply: %s' % reply)
    time.sleep(1)


def step_drive(s, addr, speed=15):
    speed = int(speed)
    s.start_heartbeat()
    key = acquire(s, addr)
    log('==', 'forward at %d for 3 s' % speed)
    throttle(s, key, 'R1')
    throttle(s, key, 'V%d' % speed)
    time.sleep(3)
    throttle(s, key, 'V0')
    time.sleep(1.5)
    log('==', 'reverse at %d for 3 s' % speed)
    throttle(s, key, 'R0')
    throttle(s, key, 'V%d' % speed)
    time.sleep(3)
    throttle(s, key, 'V0')
    time.sleep(1)
    log('==', 'F0 (headlight) press/release twice, 2 s apart')
    for _ in range(2):
        throttle(s, key, 'F10')
        throttle(s, key, 'F00')
        time.sleep(2)
    log('==', 'fractional speed check: V7.5 (expect it ignored or truncated)')
    throttle(s, key, 'V7.5')
    time.sleep(1.5)
    throttle(s, key, 'V0')
    time.sleep(1)


def step_frac(s, addr, secs=5):
    s.start_heartbeat()
    key = acquire(s, addr)
    log('==', 'blinking the headlight 3 times')
    for _ in range(6):
        throttle(s, key, 'F10')
        throttle(s, key, 'F00')
        time.sleep(0.6)
    log('==', 'speed 7.5 for %s s - watch the loco and the << lines' % secs)
    throttle(s, key, 'R1')
    throttle(s, key, 'V7.5')
    time.sleep(float(secs))
    throttle(s, key, 'V0')
    time.sleep(1)


def step_heartbeat(s, addr, speed=10):
    s.start_heartbeat()
    key = acquire(s, addr)
    throttle(s, key, 'R1')
    throttle(s, key, 'V%d' % int(speed))
    time.sleep(2)
    log('==', 'heartbeat stopped; waiting up to 40 s for the station to stop the loco')
    s.heartbeat_on = False
    since = len(s.lines)  # only lines from now on - acquiring reports V-1 too
    stopped = None
    end = time.time() + 40
    while time.time() < end and s.alive:
        stopped = next((l for l in s.lines[since:] if l.startswith('MTA' + key) and
                        (l.endswith('V0') or l.endswith('V-1'))), None)
        if stopped:
            break
        time.sleep(0.2)
    log('==', 'station stopped it after %.1f s: %s' % (time.time() - (end - 40), stopped)
        if stopped else 'no stop seen (station alive: %s)' % s.alive)


def step_turnout(s, tid):
    s.start_heartbeat()
    time.sleep(1)
    for action in ('T', 'C'):
        s.send('PTA%s%s' % (action, tid))
        log('==', 'reply: %s' % s.wait_for('PTA', 3))
        time.sleep(1.5)


def step_clients(host, port, limit=20):
    sessions = []
    try:
        for n in range(1, int(limit) + 1):
            try:
                s = Session(host, port, name='spike%d' % n, quiet=True)
            except OSError as e:
                log('==', 'session %d refused at connect: %s' % (n, e))
                break
            sessions.append(s)
            greeting = s.wait_for('VN', 3) or s.wait_for('PPA', 1)
            if not greeting or not s.alive:
                log('==', 'session %d connected but got no greeting (alive: %s)' % (n, s.alive))
                break
            log('==', 'session %d ok (%s)' % (n, greeting))
        alive = sum(1 for x in sessions if x.alive)
        log('==', '%d sessions opened, %d still alive' % (len(sessions), alive))
    finally:
        for s in sessions:
            s.quiet = True
            if s.alive:
                s.close()


def step_native(host, port, cmds):
    sock = socket.create_connection((host, port), timeout=5)
    sock.settimeout(0.5)
    for cmd in cmds or ['<s>', '<JT>']:
        log('>>', cmd)
        sock.sendall((cmd + '\n').encode())
        end = time.time() + 2
        buf = b''
        while time.time() < end:
            try:
                data = sock.recv(1024)
            except socket.timeout:
                continue
            if not data:
                break
            buf += data
        for part in buf.decode(errors='replace').replace('>', '>\n').splitlines():
            if part.strip():
                log('<<', part.strip())
    sock.close()


def main(argv):
    if len(argv) < 3:
        print(__doc__)
        return 1
    host, step, args = argv[1], argv[2], argv[3:]
    port = 2560
    if ':' in host:
        host, port = host.rsplit(':', 1)
        port = int(port)

    if step == 'clients':
        step_clients(host, port, *args)
        return 0
    if step == 'native':
        step_native(host, port, args)
        return 0

    steps = {'listen': step_listen, 'power': step_power, 'drive': step_drive,
             'heartbeat': step_heartbeat, 'turnout': step_turnout,
             'frac': step_frac}
    if step not in steps:
        print(__doc__)
        return 1
    s = Session(host, port)
    try:
        time.sleep(1)  # let the station's opening announcements arrive
        steps[step](s, *args)
    except KeyboardInterrupt:
        log('!!', 'Ctrl-C: stopping')
    finally:
        s.close()
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
