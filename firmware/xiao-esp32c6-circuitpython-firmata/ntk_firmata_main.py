"""
NTK Firmata bridge for the Seeed XIAO ESP32-C6, running CircuitPython.

Speaks the same byte-level Firmata protocol as Arduino's official
"StandardFirmataWiFi" sketch, over a plain TCP socket on port 3030 - so
this is a drop-in replacement for a WiFi Firmata board as far as NTK is
concerned (see server/modules/nlHardware/NetworkModel.js in the NTK
repo, which already expects exactly this).

Setup:
1. Copy code.py, this file, firmata_server.py, and pins.py onto the
   CIRCUITPY drive, and copy settings.toml.example to settings.toml
   (also on CIRCUITPY) with your own WiFi credentials filled in.
2. Watch the serial console for the IP address DHCP assigns this board.
3. In NTK, add an AnalogIn/AnalogOut/DigitalIn/DigitalOut/Servo widget,
   set its Device dropdown to "Network", and enter that IP with port
   3030.

WiFi mode (settings.toml, NTK_WIFI_MODE) - both actually joined/started
over in code.py, before this module is ever imported; see the comment
at the top of that file for why:
  "station" (default) - join the WiFi named in NTK_WIFI_SSID, as
    above; the board's address comes from that network's DHCP.
  "ap" - the board makes its OWN WiFi network (SoftAP) and is always
    reachable at a fixed 192.168.4.1, port 3030. Use this when there's no
    usable router (workshops, demos, locked-down guest WiFi). The computer
    joins the board's network and loses its normal WiFi/internet while
    joined, and range is shorter than station mode. Configure the network
    name/password with NTK_AP_SSID / NTK_AP_PASSWORD.
"""

import errno
import gc
import json
import os
import sys
import supervisor
import time
import wifi
import socketpool
import microcontroller

try:
    import watchdog as _watchdog
except ImportError:  # not every CircuitPython build ships it
    _watchdog = None


# ---------------------------------------------------------------------------
# Status LED
# ---------------------------------------------------------------------------
# The XIAO ESP32-C6's on-board user LED (board.LED, GPIO15) is driven as a
# coarse "what is the firmware doing" indicator you can read across a room
# with no serial console attached:
#
#   boot / wake-up ............ one fast 4-blink burst
#   working on WiFi .......... slow steady blink (~1s period)
#   WiFi up, no client yet ... a quick double-pulse every ~2s
#   client connected ......... solid on
#
# All best-effort: if the LED pin can't be claimed (a board without one,
# or the pin already in use) every call below is a silent no-op. The XIAO
# user LED is active-LOW - pin low = lit - hence the inversion in
# _led_write().

_led = None

# Non-blocking background patterns: a tuple of (lit?, hold_seconds) steps,
# cycled forever by led_tick(). led_wake_blink() is the one blocking one
# (a short burst, only at boot, before anything time-sensitive).
_LED_CONNECTING = ((True, 0.5), (False, 0.5))
_LED_WAITING = ((True, 0.05), (False, 0.2), (True, 0.05), (False, 2.0))
# A single, steady pulse once a second - a "heartbeat" - while the
# standalone interpreter is actively driving hardware on its own
# (whether idle-waiting for a client, or being watched by one in
# monitor mode). Deliberately a different RHYTHM (one blink, not two)
# from _LED_WAITING, not just a different rate, so the two read as
# different states at a glance rather than "waiting, but faster/slower" -
# added 2026-09-21 so standalone-vs-normal-handoff is visible without
# needing the serial console open.
_LED_STANDALONE_RUNNING = ((True, 0.15), (False, 0.85))
# Two even pulses a second - a client is watching (Monitor Device) but
# NOT in control; the interpreter is still driving hardware itself,
# same as _LED_STANDALONE_RUNNING, just with an extra pulse to show
# someone's watching. Deliberately reuses that one-pulse rhythm's
# timing rather than inventing a new one, so the two read as "the same
# state, plus one" rather than unrelated patterns - added 2026-09-21
# alongside _LED_STANDALONE_RUNNING, same reasoning.
_LED_MONITORING = ((True, 0.15), (False, 0.15), (True, 0.15), (False, 0.55))

_led_pattern = None
_led_step = 0
_led_next_change = 0.0


def _led_init():
    global _led
    try:
        import board
        import digitalio

        _led = digitalio.DigitalInOut(board.LED)
        _led.direction = digitalio.Direction.OUTPUT
        _led_write(False)
    except Exception as e:
        print("(status LED unavailable:", e, ")")
        _led = None


def _led_write(lit):
    if _led is not None:
        try:
            _led.value = not lit  # active-low: pin low = lit
        except Exception:
            pass


def led_wake_blink():
    """Boot signal: a short fast burst the instant the firmware starts,
    before any WiFi work - "the board woke up and is running code.py"."""
    for _ in range(4):
        _led_write(True)
        time.sleep(0.06)
        _led_write(False)
        time.sleep(0.1)


def led_set_pattern(pattern):
    """Select the non-blocking background blink pattern (None leaves the
    LED as-is). Cheap to call every loop - only re-arms on a change."""
    global _led_pattern, _led_step, _led_next_change
    if pattern is not _led_pattern:
        _led_pattern = pattern
        _led_step = 0
        _led_next_change = 0.0  # take effect on the next led_tick()


def led_tick():
    """Advance the current background pattern. Call often - returns
    immediately until the next step is actually due, so it's safe to
    drop into any poll loop next to feed()."""
    global _led_step, _led_next_change
    if _led is None or _led_pattern is None:
        return
    now = time.monotonic()
    if now < _led_next_change:
        return
    lit, hold = _led_pattern[_led_step]
    _led_write(lit)
    _led_step = (_led_step + 1) % len(_led_pattern)
    _led_next_change = now + hold


def led_solid_on():
    """Client connected - stop blinking and hold the LED on."""
    led_set_pattern(None)
    _led_write(True)


# ---------------------------------------------------------------------------
# Hang recovery
# ---------------------------------------------------------------------------
# The failure this guards against: this module is running, the board
# looks dead, and neither Ctrl-C nor Thonny's Stop button gets a REPL
# back - because the hang is inside a C-level call (board.I2C() probing
# a bus with no pull-ups, a wedged socket) where the CircuitPython VM
# never runs to service an interrupt.
#
# Two layers here (a third, the escape hatch, runs earlier - in code.py,
# before this module is even imported - see that file's own comment):
#   1. Hardware watchdog (RESET mode) - if the main loop stops feeding
#      it, the chip hard-resets. RESET is the only mode that recovers a
#      C-level hang; WatchDogMode.RAISE needs the VM, which is exactly
#      what's stuck. feed() is called after each boot milestone and every
#      server-loop iteration.
#   2. Reset-loop guard - if the last few resets were all the watchdog
#      firing, something is persistently wedged; stop rebooting into it
#      and sit at the REPL so it can be fixed.
#
# A related but separate problem, NOT a hang: the WiFi radio silently
# dropping off the network (station mode) while this module keeps
# running and polling normally, with nothing here able to notice on its
# own - see _check_wifi_still_connected()'s own docstring for the
# hardware-verified failure and its own bounded reset-and-rejoin fix.

_NVM_WDT_COUNT = 0           # microcontroller.nvm byte index for layer 2
_MAX_WDT_RESETS = 3

_NVM_WIFI_RECONNECT_COUNT = 1  # separate nvm byte - see _check_wifi_still_connected()
_MAX_WIFI_RECONNECT_RESETS = 5

_wdt = None


def _reset_loop_guard():
    """Layer 2. Runs first. If we just came back from a watchdog reset,
    bump a counter in NVM; once it hits _MAX_WDT_RESETS in a row, clear
    it and drop to the REPL instead of booting the server again. Any
    other reset reason (power-on, RESET button, soft reboot) clears the
    counter. Silently skipped if this build has no usable nvm."""
    try:
        was_watchdog = (
            microcontroller.cpu.reset_reason is microcontroller.ResetReason.WATCHDOG
        )
        if was_watchdog:
            count = microcontroller.nvm[_NVM_WDT_COUNT] + 1
            microcontroller.nvm[_NVM_WDT_COUNT] = count
            print("Recovered from a watchdog reset (%d in a row)." % count)
            if count >= _MAX_WDT_RESETS:
                microcontroller.nvm[_NVM_WDT_COUNT] = 0
                print(
                    "\n*** %d watchdog resets in a row - something is stuck.\n"
                    "*** Firmata NOT started so you can get in and fix it.\n"
                    "*** The REPL is available now.\n" % _MAX_WDT_RESETS
                )
                sys.exit()
        elif microcontroller.nvm[_NVM_WDT_COUNT] != 0:
            # Only write on a real change - nvm is flash, and this runs
            # every boot.
            microcontroller.nvm[_NVM_WDT_COUNT] = 0
    except Exception:
        pass


def _use_existing_watchdog():
    """code.py's _connect_station() already armed the hardware watchdog
    for every station-mode boot (the default path, and AP mode's own
    fallback if start_ap() failed - see that file's module docstring)
    before this module was ever imported. This just points feed()
    (called throughout this module) at that same watchdog, rather than
    re-arming it: hardware-verified 2026-09-19 - re-setting mode/timeout
    on an already-armed watchdog raises "Invalid argument" on this
    CircuitPython build, which was silently leaving _wdt as None and
    starving the already-running watchdog of feed() calls for the rest
    of the session (a real, live bug - the watchdog was still armed and
    counting down with nothing feeding it)."""
    global _wdt
    if _watchdog is None:
        return
    try:
        _wdt = microcontroller.watchdog
    except Exception as e:
        print("(watchdog unavailable:", e, ")")
        _wdt = None


def feed():
    """Pet the watchdog. Safe to call anywhere, any number of times;
    does nothing if the watchdog isn't armed."""
    if _wdt is not None:
        try:
            _wdt.feed()
        except Exception:
            pass


def clear_reset_loop_count():
    """Called once the server has been healthy for a while - a real
    successful run, so forget any earlier watchdog resets AND any
    earlier WiFi-drop-triggered resets (see
    _check_wifi_still_connected() - a real recovery deserves a clean
    slate for both counters, not just the watchdog one)."""
    try:
        if microcontroller.nvm[_NVM_WDT_COUNT] != 0:
            microcontroller.nvm[_NVM_WDT_COUNT] = 0
            print("Healthy run - watchdog-reset counter cleared.")
        if microcontroller.nvm[_NVM_WIFI_RECONNECT_COUNT] != 0:
            microcontroller.nvm[_NVM_WIFI_RECONNECT_COUNT] = 0
            print("Healthy run - WiFi-reconnect counter cleared.")
    except Exception:
        pass


def _check_wifi_still_connected():
    """Hardware-verified 2026-09-19: the WiFi radio can silently drop
    off the network (wifi.radio.connected goes False) while this board
    is just sitting in run_server()'s accept-wait loop, with nothing in
    that loop able to notice - it just keeps polling accept() forever,
    genuinely believing it's still reachable, until someone physically
    power-cycles it. An "ugly hack" fix rather than a real root cause:
    if the radio's dropped, just reset the whole board - the exact same
    boot path already proven to reconnect cleanly every time (see
    code.py's own module docstring) is far more reliable than trying to
    patch together a live reconnect from inside this module, which
    risks the same heap-fragmentation failure documented there for
    wifi.radio.connect()/start_ap() calls made from in here.

    Bounded via its own nvm counter (separate from the watchdog one) so
    a genuinely unreachable network (router down, wrong password) can't
    turn into an infinite fast reboot loop - after
    _MAX_WIFI_RECONNECT_RESETS in a row with no healthy run in between,
    this gives up and leaves the board sitting disconnected instead of
    keeps resetting. Station mode only - in AP mode this board IS the
    access point, so wifi.radio.connected (the station-side property)
    doesn't apply the same way. Skipped entirely on a build with no
    usable nvm."""
    if _ap_mode_active or wifi.radio.connected:
        return
    try:
        count = microcontroller.nvm[_NVM_WIFI_RECONNECT_COUNT] + 1
        if count >= _MAX_WIFI_RECONNECT_RESETS:
            microcontroller.nvm[_NVM_WIFI_RECONNECT_COUNT] = 0
            print(
                "\n*** WiFi dropped %d times in a row with no healthy run "
                "in between - giving up on auto-reconnect.\n"
                "*** Staying disconnected; power-cycle to try again.\n"
                % _MAX_WIFI_RECONNECT_RESETS
            )
            return
        microcontroller.nvm[_NVM_WIFI_RECONNECT_COUNT] = count
        print("WiFi dropped - resetting to reconnect (%d in a row)." % count)
    except Exception:
        # No usable nvm on this build - reset anyway rather than silently
        # staying disconnected forever, just without the loop-guard bound.
        print("WiFi dropped - resetting to reconnect.")
    microcontroller.reset()


# pins.py probes each configured Grove I2C sensor (LIS3DHTR, VL53L0X) at
# import time, via board.I2C() calls that can hang at the C driver level
# rather than raising quickly if that bus currently has no pull-ups, a
# disconnected sensor mid-transaction, or similar - a hang like that
# blocks before CircuitPython's VM ever gets a chance to check for a
# Ctrl-C, and can even keep Thonny's Stop button from working. The
# watchdog, armed in run() below before this happens, is what recovers
# that now - it'll reset the board, and the reset-loop guard breaks the
# cycle if it keeps happening.
from firmata_server import (
    FirmataServer,
    START_SYSEX,
    END_SYSEX,
    STANDALONE_MONITOR_REQUEST,
    encode_standalone_monitor_reply,
)
from pins import PIN_TABLE, GROVE_SENSOR_CATALOG

# Standalone patch execution (see plans/standalone-patch-export.md) - v1,
# not on every board yet, so this whole feature is optional. Deliberately
# checks for standalone_patch.json's presence FIRST, before ever
# importing standalone_interpreter - hardware-verified 2026-09-20:
# importing that module (even as compiled bytecode, even completely
# unused) is not free, and an ordinary live-connected session with no
# standalone patch should never pay any part of that cost. See
# standalone_interpreter.py's own module docstring for why it MUST be
# deployed as standalone_interpreter.mpy (compiled via mpy-cross), never
# as raw .py source - that was the actual root cause of a real WiFi
# reliability regression, not just a style preference.
STANDALONE_PATCH_PATH = "standalone_patch.json"

_standalone = None
try:
    os.stat(STANDALONE_PATCH_PATH)
    _has_standalone_patch = True
except OSError:
    _has_standalone_patch = False

if _has_standalone_patch:
    try:
        from standalone_interpreter import StandaloneInterpreter, load_patch_file
    except ImportError:
        StandaloneInterpreter = None

    if StandaloneInterpreter is not None:
        _standalone_patch = load_patch_file(STANDALONE_PATCH_PATH)
        if _standalone_patch is not None:
            _candidate = StandaloneInterpreter(PIN_TABLE, GROVE_SENSOR_CATALOG)
            if _candidate.load(_standalone_patch):
                _standalone = _candidate
                print("Standalone patch loaded and compatible:", STANDALONE_PATCH_PATH)
            else:
                print("Standalone patch present but rejected:", _candidate.error)


def _handle_push_patch_request(firmata):
    """Called from run_server()'s main per-connection loop when
    firmata.pending_push_patch is set (see firmata_server.py's
    PUSH_PATCH_REQUEST handling) - writes the received JSON to
    STANDALONE_PATCH_PATH and resets the board so it reloads with the
    new patch. A reset (not an in-place reload) is necessary: _standalone
    above is a module-level object built once at import time - the
    running interpreter has no mechanism to swap in a freshly-written
    patch without a fresh boot. NTK's own StandaloneCompatibility.js
    check already runs host-side before a push is ever sent, but this
    still does its own json.loads() sanity check before writing/acking -
    a truncated or corrupted transmission (unlikely, but not otherwise
    caught anywhere in this path) would otherwise silently overwrite a
    good patch with something _standalone rejects at the next boot, with
    no feedback that anything went wrong.

    A patch with zero widgets is a deliberate ERASE, not a real push
    (added 2026-09-23, reusing this same request rather than a separate
    command) - deletes STANDALONE_PATCH_PATH instead of writing a
    valid-but-inert empty patch to it. Writing an empty-but-present file
    would still make _has_standalone_patch True at the next boot (see
    the os.stat() check above), leaving the device showing as
    "standalone running" with nothing to do - not the same as genuinely
    having no standalone patch, which is what erasing is supposed to
    mean."""
    patch_json = firmata.pending_push_patch
    firmata.pending_push_patch = None
    try:
        parsed = json.loads(patch_json)  # raises ValueError if malformed - caught below
        if not parsed.get("widgets"):
            try:
                os.remove(STANDALONE_PATCH_PATH)
                print("Standalone patch erased (empty patch received) - resetting")
            except OSError:
                print("Standalone patch erase requested, but none was saved - resetting anyway")
            firmata.send_push_patch_reply(True)
            time.sleep(0.3)
            microcontroller.reset()
            return

        with open(STANDALONE_PATCH_PATH, "w") as f:
            f.write(patch_json)
        firmata.send_push_patch_reply(True)
        print("Standalone patch received (%d bytes) - resetting to load it" % len(patch_json))
        # The ack above must actually reach the host before this
        # connection drops with the rest of the board on reset().
        time.sleep(0.3)
        microcontroller.reset()
    except Exception as e:
        print("Push patch failed:", e)
        try:
            firmata.send_push_patch_reply(False, str(e))
        except Exception:
            pass  # connection may already be in a bad state - nothing more to do


def _handle_pull_patch_request(firmata):
    """Called from run_server()'s main per-connection loop when
    firmata.pull_patch_requested is set. Deliberately re-reads
    STANDALONE_PATCH_PATH from disk rather than reflecting _standalone's
    in-memory state, so a pull always reports the actual file - which
    could in principle differ from what _standalone loaded at boot
    (there's no code path that writes this file other than a push
    today, but reading the live file is the more honest answer to "what
    would this device run if rebooted right now" regardless)."""
    firmata.pull_patch_requested = False
    try:
        with open(STANDALONE_PATCH_PATH, "r") as f:
            patch_json = f.read()
        firmata.send_pull_patch_reply(patch_json)
    except OSError:
        firmata.send_pull_patch_reply(None)

# Filled in by run() - needed by run_server() below, but only known once
# code.py hands off (it owns FIRMATA_PORT so the SoftAP success message
# over there can mention the same port number).
FIRMATA_PORT = 3030
_ap_mode_active = False  # set by run() - gates the RSSI log in run_server()

# Not necessarily defined in every CircuitPython build's errno module, so
# hardcoded rather than referenced as errno.ENOTCONN. Seen empirically on
# real XIAO ESP32-C6 hardware: recv_into() can spuriously raise this right
# after accept() returns, before the underlying lwIP connection state has
# finished settling - the connection is actually fine. Only tolerated for
# a brief window after connecting (see CONNECTION_GRACE_PERIOD_S) so a
# genuine later disconnect via this same errno still gets caught.
ENOTCONN = 128
CONNECTION_GRACE_PERIOD_S = 2


# How long send_all() will keep retrying on EAGAIN (ordinary
# backpressure - see below) before giving up and treating the
# connection as dead. Hardware-verified 2026-09-19: EAGAIN doesn't
# reliably flip to a real disconnect error (ECONNRESET/EPIPE) when the
# peer vanishes mid-send on this socket implementation - the retry loop
# below can spin on EAGAIN forever, watchdog-fed the whole time (so it
# never even resets), with the connection silently dead. From NTK's
# side this looked exactly like "widget connects, gets one reading,
# then nothing ever again" - not a WiFi/DHCP issue as first suspected,
# a real bug in this loop's own missing bound.
SEND_RETRY_TIMEOUT_S = 5


def send_all(conn, data, on_wait=None):
    # socket.send() returns the number of bytes actually accepted, same
    # as POSIX send() - it can legitimately send fewer than requested
    # (especially right after accept(), before this appears to have
    # caused problems on this hardware) and raising no exception either
    # way, so a bare conn.send(data) can silently drop bytes. This loops
    # until every byte is confirmed sent.
    sent_total = 0
    view = memoryview(data)
    retry_deadline = None
    while sent_total < len(data):
        try:
            n = conn.send(view[sent_total:])
        except OSError as e:
            if e.errno == errno.EAGAIN:
                # Non-blocking socket (conn.settimeout(0)): send() can
                # raise EAGAIN when the outgoing TCP buffer is
                # momentarily full - ordinary backpressure, not a real
                # error. Seen on real hardware: a burst of rapid analog
                # reporting eventually outran what the link could
                # drain. Busy-poll until there's room instead of giving
                # up - but pet the watchdog on every spin (a real bug
                # until this fix: wiring an AnalogIn straight into a
                # Servo/output creates exactly this sustained rapid-
                # report burst, this loop was the only potentially-long
                # wait anywhere in the whole run_server() loop with no
                # feed() of its own, and outrunning the watchdog's 20s
                # here hard-reset the board mid-send - looking like a
                # random crash, not backpressure).
                feed()
                if retry_deadline is None:
                    retry_deadline = time.monotonic() + SEND_RETRY_TIMEOUT_S
                elif time.monotonic() > retry_deadline:
                    # Stuck on EAGAIN this long - treat the peer as
                    # gone rather than spinning forever (see this
                    # function's own module-level comment above).
                    raise OSError(errno.ECONNRESET, "send_all() gave up after %ds of EAGAIN" % SEND_RETRY_TIMEOUT_S)
                # Also keep servicing INCOMING data (on_wait, when given -
                # see run_server()) while stuck waiting for outgoing room.
                # Without this, a sustained flood on the outgoing side
                # (e.g. that same AnalogIn->Servo wiring, which reports
                # fast enough to keep this retry loop busy for a while)
                # starves recv_into() of ever running again until the
                # current send fully drains - incoming Servo/output
                # writes pile up unprocessed the whole time, looking
                # exactly like "the servo stopped working" even though
                # the watchdog fix above already stops it from crashing.
                if on_wait is not None:
                    on_wait()
                continue
            # Anything else (e.g. ECONNRESET/EPIPE because the peer
            # closed the connection) is a real failure - let it
            # propagate so run_server()'s loop notices and reports the
            # disconnect, instead of retrying forever on a socket that
            # will never accept data again.
            raise
        if n == 0:
            raise OSError("send() accepted 0 bytes")
        sent_total += n


def _print_rssi():
    # Station mode only - ap_info is the station-side "AP I'm joined to"
    # info, meaningless in AP mode, where this board IS the AP.
    if _ap_mode_active:
        return
    try:
        print("(WiFi RSSI:", wifi.radio.ap_info.rssi, ")")
    except Exception as e:
        print("(RSSI check failed:", e, ")")


def _check_keypress():
    """Non-blocking serial keystroke check for on-demand diagnostic
    prints - same serial_bytes_available pattern as code.py's escape
    hatch, just polled here instead of at boot. Called from both
    run_server()'s accept-wait loop and its while-connected loop, so
    these work regardless of whether a real client is currently
    connected. 'v' prints the standalone interpreter's live inlet/outlet
    values, 't' reprints its patch topology (both silently a no-op with
    no standalone patch loaded), 'r' prints the current WiFi RSSI
    (silently a no-op in AP mode), 'm' prints current free memory.
    Replaces the old automatic every-10s RSSI log, which printed
    constantly whether anyone was looking at the console or not.

    'm' specifically exists so free-memory checks (relevant to this
    board's real, previously-hit heap-fragmentation crashes - see
    code.py's own module docstring) can be read from INSIDE the normal
    running loop, undisturbed - checking via a Ctrl-C/REPL interrupt
    instead changes the very state being measured (unwinds whatever
    stack frames were active, and can itself drop the WiFi connection
    or trigger a watchdog reset - both hardware-verified elsewhere this
    session), so a reading taken that way doesn't reflect real steady-
    state operation. gc.collect() first so this reports genuinely-
    reclaimed free memory, not memory that's dead but not yet swept -
    a HIGHER number after collect() than before would itself indicate
    reclaimable garbage was piling up between passes."""
    if not supervisor.runtime.serial_bytes_available:
        return
    key = sys.stdin.read(1)
    if key == "v" and _standalone is not None:
        _standalone.print_values()
    elif key == "t" and _standalone is not None:
        _standalone.print_topology()
    elif key == "r":
        _print_rssi()
    elif key == "m":
        gc.collect()
        print("Free memory:", gc.mem_free(), "bytes")


_MONITOR_REQUEST_BYTES = bytes([START_SYSEX, STANDALONE_MONITOR_REQUEST, END_SYSEX])
_MONITOR_PEEK_WINDOW_S = 0.3
_MONITOR_PUSH_INTERVAL_S = 0.3


def _peek_for_monitor_request(conn):
    """Non-blocking peek at a freshly-accepted connection for an
    immediate STANDALONE_MONITOR_REQUEST sysex, sent by a client that
    wants to watch a running standalone patch's live values instead of
    taking over from it (see plans/standalone-patch-export.md). Must
    run BEFORE the normal explicit-handoff release_hardware() call, in
    the narrow window right after accept() - once that release happens
    the interpreter has already given up its pins, so there would be
    nothing live left to monitor.

    Bounded to a short window (not the 5s a normal firmata-io client
    silently sits for before starting its own handshake - see
    FirmataServer.on_connect's comment) so every ordinary connection
    only ever pays this as a brief, fixed delay, not something that
    scales with a slow/absent handshake.

    Returns (is_monitor_request, leftover_bytes). Real bug, hardware-
    found 2026-09-21: this reads bytes off the socket to check them,
    and a normal (non-monitor) client's own opening handshake bytes can
    land in that same window - discarding them (the original behavior)
    silently desynced that connection's Firmata byte stream from the
    very first read, breaking every widget on it, recovering only once
    it disconnected and a fresh connection/tick cycle began. The caller
    must feed leftover_bytes into the real FirmataServer once it's
    constructed, for any bytes read here that turned out not to be a
    monitor request."""
    conn.settimeout(0)
    peek_buffer = bytearray(8)
    buf = bytearray()
    deadline = time.monotonic() + _MONITOR_PEEK_WINDOW_S
    while time.monotonic() < deadline:
        try:
            n = conn.recv_into(peek_buffer)
        except OSError:
            n = 0
        if n:
            buf.extend(peek_buffer[:n])
            if bytes(buf[:3]) == _MONITOR_REQUEST_BYTES:
                return True, b""
            if len(buf) >= len(_MONITOR_REQUEST_BYTES):
                return False, bytes(buf)  # some other client - hand back what we read
        time.sleep(0.01)
    return False, bytes(buf)


def _serve_monitor_connection(conn, addr):
    """Alternate to the normal per-connection FirmataServer takeover -
    the standalone interpreter keeps ticking and owning every pin
    exactly as if nothing connected at all; this just periodically
    reports its live widget values to the monitoring client instead.
    Any incoming bytes from this client (e.g. a dragged widget trying
    to write a value) are read and silently discarded - a monitoring
    connection can't affect the running patch, by design (see the
    write-while-monitoring design decision in the session that added
    this)."""
    print("Client connected from", addr, "(monitor mode)")
    led_set_pattern(_LED_MONITORING)
    read_buffer = bytearray(64)
    # Fixed-cadence schedule (next_push += interval), not "elapsed
    # since last push, then reset from now" - the latter drifts: any
    # one push that takes longer than usual (a slow WiFi send is
    # common, not rare) permanently shifts every push after it later
    # by that same amount, compounding into visibly uneven gaps over
    # time instead of a steady rhythm - reported as "choppy" timing via
    # hands-on testing 2026-09-22, once monitor mode's other bugs were
    # fixed enough to actually see it.
    next_push = time.monotonic() + _MONITOR_PUSH_INTERVAL_S
    try:
        while True:
            feed()
            led_tick()
            _standalone.tick()
            _check_keypress()
            now = time.monotonic()
            if now >= next_push:
                next_push += _MONITOR_PUSH_INTERVAL_S
                if next_push <= now:
                    # Fell more than one full interval behind (e.g. a
                    # send stalled this loop for a while) - catching up
                    # one interval at a time here would fire a burst of
                    # queued pushes back to back instead. Snap forward
                    # to resume cleanly at the normal cadence.
                    next_push = now + _MONITOR_PUSH_INTERVAL_S
                for wid in _standalone.widgets:
                    fields = _standalone.monitor_fields(wid)
                    if not fields:
                        continue
                    try:
                        send_all(conn, encode_standalone_monitor_reply(wid, fields))
                    except OSError as e:
                        print("(monitor disconnect reason: send errno", e.errno, "args", e.args, ")")
                        return
            try:
                n = conn.recv_into(read_buffer)
                if n == 0:
                    print("(monitor disconnect reason: recv_into returned 0)")
                    return
            except OSError as e:
                if e.errno != errno.EAGAIN:
                    print("(monitor disconnect reason: recv_into errno", e.errno, "args", e.args, ")")
                    return
    finally:
        try:
            conn.close()
        except Exception:
            pass
        print("Monitor client disconnected")
        led_set_pattern(_LED_STANDALONE_RUNNING)


def run_server():
    pool = socketpool.SocketPool(wifi.radio)
    server_socket = pool.socket(pool.AF_INET, pool.SOCK_STREAM)
    try:
        server_socket.setsockopt(pool.SOL_SOCKET, pool.SO_REUSEADDR, 1)
    except Exception:
        pass  # not critical if unsupported on this CircuitPython build
    server_socket.bind(("0.0.0.0", FIRMATA_PORT))
    server_socket.listen(1)
    # Without a timeout, accept() blocks at the C level with no way for
    # CircuitPython to service a keyboard interrupt (Ctrl+C) or the REPL
    # in the meantime - the board looks completely hung until a
    # connection happens to arrive. Polling in a short loop instead
    # keeps the board responsive while idle.
    #
    # A much shorter timeout when a standalone patch is loaded - the
    # accept-wait loop below is also where its tick() runs (see the
    # explicit-handoff design in plans/standalone-patch-export.md), and a
    # full second per accept() poll would cap it at ~1Hz, far too slow
    # for real hardware control (the 2026-09-17 performance spike showed
    # hundreds of Hz achievable). No standalone patch loaded - the
    # existing 1s idle-poll behavior is unchanged.
    #
    # Bisection step 2026-09-21: loosened from 0.02s to 0.1s (10Hz
    # instead of 50Hz) - testing whether the very tight poll/tick loop
    # (real GPIO I/O every cycle, 50x more accept() syscalls than idle)
    # was competing for CPU time against the WiFi stack's own background
    # servicing on this single-core chip. Reliability with a patch
    # actually loaded and ticking measured at 7/12 (~58%) across two
    # trial batches at 0.02s, notably worse than the ~92% measured
    # yesterday with the interpreter merely imported but idle (which
    # never touched this timeout at all, since _standalone was None
    # then) - this is the leading hypothesis for that gap, not yet
    # confirmed. 10Hz is still far above the ~1Hz idle case and should
    # be plenty for pot-turning/button-pressing interaction; revisit if
    # a real use case needs faster response than that.
    server_socket.settimeout(0.1 if _standalone is not None else 1)
    feed()
    print("Firmata server listening on port", FIRMATA_PORT)
    # WiFi is up and we're listening but nobody's connected yet - switch
    # from the "working on WiFi" blink to whichever idle pattern applies.
    led_set_pattern(_LED_STANDALONE_RUNNING if _standalone is not None else _LED_WAITING)

    if _standalone is not None:
        _standalone.claim_hardware()
        print("Standalone interpreter running (no client connected)")
        print("Press 'v' for live values, 't' for topology, 'r' for WiFi RSSI, 'm' for free memory, at any time on this console.")
        print("(Click in this pane, press the desired key, and hit Enter.)")
    else:
        print("Press 'r' for WiFi RSSI, 'm' for free memory, at any time on this console.")
        print("(Click in this pane, press the desired key, and hit Enter.)")

    # Steady-state post-init reading - WiFi up, server listening,
    # standalone interpreter claimed (including any OSC sockets/pins it
    # needed) if present, nobody connected yet. Taken here, after
    # everything above has actually run, so it's the truest "fully
    # booted, ready to serve" snapshot - the baseline to compare later
    # 'm' keypress readings against as the board keeps running. See
    # _check_keypress()'s own comment for why this has to be read from
    # inside the running loop, not via a REPL interrupt, to mean
    # anything.
    gc.collect()
    print("Free memory at boot:", gc.mem_free(), "bytes")

    read_buffer = bytearray(128)

    # If we ran this long without the watchdog firing, this is a healthy
    # boot - forget any earlier watchdog resets so the reset-loop guard
    # starts fresh. Done inside the loop below so a hang that only shows
    # up under load still accumulates toward the guard's limit.
    server_started_at = time.monotonic()
    reset_count_cleared = False
    last_wifi_check = time.monotonic()

    while True:
        print("Waiting for Client to connect...")
        conn = None
        while conn is None:
            feed()  # accept() blocks the VM for up to 1s per poll (0.1s - see above - while a standalone patch is loaded)
            led_tick()
            if _standalone is not None:
                _standalone.tick()
            _check_keypress()
            if not reset_count_cleared and time.monotonic() - server_started_at > 30:
                clear_reset_loop_count()
                reset_count_cleared = True
            if time.monotonic() - last_wifi_check > 5.0:
                last_wifi_check = time.monotonic()
                _check_wifi_still_connected()  # resets the board if the radio dropped - see its own docstring
            try:
                conn, addr = server_socket.accept()
            except OSError:
                pass  # timed out with no connection yet - keep polling
        _peeked_leftover = b""
        if _standalone is not None:
            _is_monitor_request, _peeked_leftover = _peek_for_monitor_request(conn)
            if _is_monitor_request:
                # Monitoring connection - the interpreter keeps every pin
                # and keeps ticking exactly as if nothing connected; see
                # _serve_monitor_connection's own docstring. Explicitly
                # does NOT fall through to the explicit-handoff release
                # below - this is the whole point of monitor mode.
                _serve_monitor_connection(conn, addr)
                continue
        if _standalone is not None:
            # Explicit handoff (plans/standalone-patch-export.md) - a real
            # client is taking over now, so release every pin the
            # interpreter claimed before firmata (below) claims the same
            # physical pins for itself. Without this, its pin-mode setup
            # hits "already in use" and silently fails.
            _standalone.release_hardware()
            print("Standalone interpreter paused (client connected)")
        try:
            # Disables Nagle, so small packets (most Firmata messages are
            # 2-4 bytes) go out immediately instead of waiting to coalesce.
            conn.setsockopt(pool.IPPROTO_TCP, pool.TCP_NODELAY, 1)
        except Exception:
            pass  # not critical if unsupported on this CircuitPython build
        print("Client connected from", addr)
        if not _ap_mode_active:
            # ap_info is the station side's "AP I'm joined to" info -
            # meaningless in AP mode, where this board IS the AP.
            try:
                _info = wifi.radio.ap_info
                print("(WiFi signal at connect: RSSI", _info.rssi, "channel", _info.channel, ")")
            except Exception as e:
                print("(RSSI check failed:", e, ")")
        led_solid_on()

        firmata = FirmataServer(PIN_TABLE, GROVE_SENSOR_CATALOG)
        # on_connect() just registers the send callback - it deliberately
        # sends nothing itself (see the comment on FirmataServer.on_connect
        # in firmata_server.py for why: NTK's host-side firmata-io library
        # only kicks off its handshake from its own 5-second "no version
        # yet" fallback timer, so NTK will appear to do nothing for up to
        # 5 seconds after "NTK connected" - that's expected, not a hang.
        def _drain_incoming_once():
            # Best-effort, single non-blocking recv while send_all() is
            # stuck retrying on backpressure (see its own comment) - keeps
            # incoming Servo/output writes flowing even during a sustained
            # outgoing flood, instead of only ever being read once the
            # current send fully drains. Errors (EAGAIN - nothing
            # available right now, or a real disconnect) are deliberately
            # swallowed here; the outer loop's own recv_into() call
            # handles a genuine disconnect on its next iteration same as
            # always.
            try:
                n = conn.recv_into(read_buffer)
                if n:
                    firmata.feed(read_buffer[:n])
            except OSError:
                pass

        firmata.on_connect(lambda data: send_all(conn, data, on_wait=_drain_incoming_once))
        if _peeked_leftover:
            # Bytes read off this connection by _peek_for_monitor_request
            # while checking whether it was a monitor client - it wasn't,
            # so they're real Firmata protocol bytes this client already
            # sent and is not going to send again. Must be fed in before
            # the main loop below starts its own recv_into, or they're
            # simply gone - see _peek_for_monitor_request's docstring.
            firmata.feed(_peeked_leftover)
        conn.settimeout(0)
        connected_at = time.monotonic()

        try:
            while True:
                feed()
                # This loop uses conn.settimeout(0) (fully non-blocking)
                # so it can service both directions of the connection
                # without ever blocking. A tiny sleep here costs nothing
                # perceptible (sampling intervals are milliseconds
                # already) but avoids a pointless 100%-CPU busy-spin
                # between iterations.
                time.sleep(0.001)
                # 'r' on the console prints RSSI on demand (see
                # _check_keypress) - replaces the old automatic every-10s
                # log, which printed constantly regardless of whether
                # anyone was watching the console.
                _check_keypress()
                if not reset_count_cleared and time.monotonic() - server_started_at > 30:
                    clear_reset_loop_count()
                    reset_count_cleared = True
                disconnected = False
                in_grace_period = (time.monotonic() - connected_at) < CONNECTION_GRACE_PERIOD_S
                try:
                    n = conn.recv_into(read_buffer)
                    if n == 0:
                        disconnected = True  # peer closed the connection cleanly
                        print("(disconnect reason: recv_into returned 0)")
                    else:
                        firmata.feed(read_buffer[:n])
                except OSError as e:
                    # EAGAIN just means "no data available right now" on
                    # this non-blocking socket - keep looping. ENOTCONN
                    # right after connecting is the spurious lwIP quirk
                    # described above - also not a real disconnect.
                    # Anything else (e.g. ECONNRESET when the server side
                    # forcibly closes the connection, as NTK does when a
                    # widget referencing this device is removed, or
                    # ENOTCONN well after the grace period) is real.
                    if e.errno == errno.EAGAIN:
                        pass
                    elif e.errno == ENOTCONN and in_grace_period:
                        pass
                    else:
                        disconnected = True
                        print("(disconnect reason: recv_into errno", e.errno, "in_grace_period", in_grace_period, ")")

                if not disconnected:
                    try:
                        firmata.update()
                    except OSError as e:
                        if e.errno != errno.EAGAIN:
                            disconnected = True
                            print("(disconnect reason: update() errno", e.errno, "args", e.args, ")")

                if not disconnected:
                    # See firmata_server.py's PUSH_PATCH_REQUEST/
                    # PULL_PATCH_REQUEST handling - these flags are only
                    # ever set from inside firmata.feed() above (called
                    # via the recv_into branch earlier this same
                    # iteration), so checking them here is never more
                    # than one loop iteration stale.
                    if firmata.pending_push_patch is not None:
                        _handle_push_patch_request(firmata)
                    elif firmata.pull_patch_requested:
                        _handle_pull_patch_request(firmata)

                if disconnected:
                    break
        finally:
            firmata.release_all_pins()
            try:
                conn.close()
            except Exception:
                pass
            print("Client disconnected")
            # Back to waiting for the next client.
            led_set_pattern(_LED_STANDALONE_RUNNING if _standalone is not None else _LED_WAITING)
            if _standalone is not None:
                # Explicit handoff, the other direction - the client that
                # was driving outputs is gone, so the interpreter reclaims
                # the same pins and resumes ticking in the outer loop.
                _standalone.claim_hardware()
                print("Standalone interpreter resumed (client disconnected)")


def run(ap_started, firmata_port):
    """Called by code.py once it's already decided (and, for AP mode,
    already started) the WiFi mode - see that file's own comment for why
    SoftAP has to start there, before this module (with all its function
    definitions) is ever imported.

    ap_started: True if code.py's own start_ap() attempt already
      succeeded - WiFi is up already, so this skips arming the watchdog
      (see below) and just shows the AP's already-printed status.
      False if code.py already joined a station-mode network instead
      (either the normal default, or AP mode's own fallback if
      start_ap() failed over there) - either way, WiFi is ALREADY up by
      the time this runs; code.py does the joining itself now, for the
      same reason it does start_ap() itself - see that file's module
      docstring.
    firmata_port: the TCP port to listen on - code.py owns the literal
      3030 (its own SoftAP success message needs it too), passed through
      here rather than duplicated.
    """
    global FIRMATA_PORT, _ap_mode_active
    FIRMATA_PORT = firmata_port
    _ap_mode_active = ap_started

    _led_init()
    led_wake_blink()  # "the board woke up" - before anything that could hang
    # Slow steady blink from here until run_server() reports it's
    # listening - covers WiFi join (or the wait below), everything.
    led_set_pattern(_LED_CONNECTING)

    _reset_loop_guard()

    # Hardware-verified 2026-09-19: the watchdog/SoftAP conflict
    # documented in code.py isn't limited to the moment start_ap() is
    # called - having the watchdog armed at ALL during an active AP-mode
    # session degrades the AP itself over time (found via bisection: a
    # bare listening socket plus LED ticking kept a stable, joinable
    # SoftAP indefinitely; adding the armed watchdog on top - nothing
    # else changed - made the AP's SSID stop being visible/joinable
    # within the same test). So AP-mode boots run with no watchdog
    # protection at all for the whole session, not just through
    # start_ap() - a real, accepted safety trade-off specific to AP mode
    # on this board/CircuitPython version. Station-mode boots (ap_started
    # is always False there) are completely unaffected and keep full
    # watchdog protection exactly as before.
    if not ap_started:
        _use_existing_watchdog()

    run_server()
