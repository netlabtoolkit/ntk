"""
NTK Firmata bridge for the Seeed XIAO ESP32-C6, running CircuitPython.

Speaks the same byte-level Firmata protocol as Arduino's official
"StandardFirmataWiFi" sketch, over a plain TCP socket on port 3030 - so
this is a drop-in replacement for a WiFi Firmata board as far as NTK is
concerned (see server/modules/nlHardware/NetworkModel.js in the NTK
repo, which already expects exactly this).

Setup:
1. Copy this file, firmata_server.py, and pins.py onto the CIRCUITPY
   drive, and copy settings.toml.example to settings.toml (also on
   CIRCUITPY) with your own WiFi credentials filled in.
2. Watch the serial console for the IP address DHCP assigns this board.
3. In NTK, add an AnalogIn/AnalogOut/DigitalIn/DigitalOut/Servo widget,
   set its Device dropdown to "Network", and enter that IP with port
   3030.

WiFi mode (settings.toml, NTK_WIFI_MODE):
  "station" (default) - join the WiFi named in CIRCUITPY_WIFI_SSID, as
    above; the board's address comes from that network's DHCP.
  "ap" - the board makes its OWN WiFi network (SoftAP) and is always
    reachable at a fixed 192.168.4.1, port 3030. Use this when there's no
    usable router (workshops, demos, locked-down guest WiFi). The computer
    joins the board's network and loses its normal WiFi/internet while
    joined, and range is shorter than station mode. Configure the network
    name/password with NTK_AP_SSID / NTK_AP_PASSWORD.

Optional Grove LCD RGB Backlight (see grove_lcd.py): if wired up to the
board's I2C pins, this shows the station-mode IP address (and turns the
backlight green) once connected - purely a convenience so you don't have
to watch the serial console for it. Not attached? It's skipped silently.
"""

import errno
import os
import sys
import time
import wifi
import socketpool
import supervisor
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
# The failure this guards against: code.py is running, the board looks
# dead, and neither Ctrl-C nor Thonny's Stop button gets a REPL back -
# because the hang is inside a C-level call (wifi.radio.start_ap(),
# board.I2C() probing a bus with no pull-ups, a wedged socket) where the
# CircuitPython VM never runs to service an interrupt.
#
# Three layers:
#   1. Escape hatch  - a keypress in the first few seconds of boot,
#      checked BEFORE anything risky, drops straight to the REPL.
#   2. Hardware watchdog (RESET mode) - if the main loop stops feeding
#      it, the chip hard-resets. RESET is the only mode that recovers a
#      C-level hang; WatchDogMode.RAISE needs the VM, which is exactly
#      what's stuck. fed() is called after each boot milestone and every
#      server-loop iteration.
#   3. Reset-loop guard - if the last few resets were all the watchdog
#      firing, something is persistently wedged; stop rebooting into it
#      and sit at the REPL so it can be fixed.

_WDT_TIMEOUT_S = 20          # > wifi.radio.connect()'s own 10s timeout
_NVM_WDT_COUNT = 0           # microcontroller.nvm byte index for layer 3
_MAX_WDT_RESETS = 3

_wdt = None


def _reset_loop_guard():
    """Layer 3. Runs first. If we just came back from a watchdog reset,
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


def _escape_hatch(window_s=3):
    """Layer 1. A byte on the serial console within window_s seconds
    drops to the REPL. Checked before any WiFi/I2C call, so it works even
    when a later hang would be past Ctrl-C's reach: after a reset, mash a
    key (or Ctrl-C) and you're in. A longer window when a console is
    already attached (someone's watching), the short default when nobody
    is (don't stall an unattended boot)."""
    if supervisor.runtime.serial_connected:
        window_s = 6
    print(
        "NTK Firmata booting - press any key in the next %ds for the REPL..."
        % window_s
    )
    deadline = time.monotonic() + window_s
    while time.monotonic() < deadline:
        if supervisor.runtime.serial_bytes_available:
            print("Interrupted - dropping to the REPL.")
            sys.exit()
        led_tick()
        time.sleep(0.05)


def _arm_watchdog():
    """Layer 2. RESET mode, generous timeout. No-op if the watchdog
    module or timer isn't available on this build."""
    global _wdt
    if _watchdog is None:
        return
    try:
        _wdt = microcontroller.watchdog
        _wdt.timeout = _WDT_TIMEOUT_S
        _wdt.mode = _watchdog.WatchDogMode.RESET
        _wdt.feed()
        print("Watchdog armed (%ds)." % _WDT_TIMEOUT_S)
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
    successful run, so forget any earlier watchdog resets."""
    try:
        if microcontroller.nvm[_NVM_WDT_COUNT] != 0:
            microcontroller.nvm[_NVM_WDT_COUNT] = 0
            print("Healthy run - watchdog-reset counter cleared.")
    except Exception:
        pass


_led_init()
led_wake_blink()  # "the board woke up" - before anything that could hang

# Slow steady blink from here until run_server() reports it's listening -
# covers the escape-hatch window, WiFi join / SoftAP start, everything.
led_set_pattern(_LED_CONNECTING)

_reset_loop_guard()
_escape_hatch()
_arm_watchdog()

# wifi.radio.start_ap() further down can hang at a level Ctrl-C can't
# reach - see _wait_for_ctrl_c_window()'s own docstring for why a plain
# time.sleep() "press Ctrl-C now" window isn't actually good enough on
# its own: the board starts running this file the instant it's powered
# up, often well before anyone's even opened Thonny - by the time a
# human is actually watching the console, a fixed few-second window
# already counted down to nothing. Waiting for a real serial connection
# first, then giving the countdown, means the window always lands while
# someone's actually able to see and react to it.
def _wait_for_ctrl_c_window(total_delay_s, action_description):
    """Give Ctrl-C a real chance to land before a risky operation, even
    if nobody's watching the console yet at the moment this runs.

    First waits - fully interruptibly, via repeated short time.sleep()
    calls - for an actual serial console connection
    (supervisor.runtime.serial_connected), up to MAX_WAIT_FOR_SERIAL_S,
    since that's a much better proxy for "a human might actually be
    watching right now" than "some number of seconds since power-on".
    Bounded so a genuinely unattended boot (no computer ever attached -
    a permanent installation, say) doesn't stall forever waiting for a
    connection that will never come.

    Once someone's actually connected, re-prints the countdown message
    every second for total_delay_s instead of once - if Thonny was
    ALREADY open and connected before this boot (e.g. it auto-reconnects
    across a reset/replug), serial_connected can already read True the
    very instant this function runs, but Thonny's own reconnect-and-
    redraw can still take a beat to catch up on screen; a single print
    right at that instant risks landing in that gap and never actually
    being seen. Repeating it every second keeps a fresh, visible
    reminder on screen for the whole window regardless of exactly when
    the console visually catches up.

    total_delay_s: total seconds to keep prompting once a console is present.
    action_description: e.g. "Starting SoftAP" - printed each second as
      "<action_description> in <N>s - press Ctrl-C now...".
    """
    # This wait only ever DELAYS when the countdown starts (so it isn't
    # wasted before anyone's watching) - it must never be a reason to
    # skip the countdown altogether. Bailing out here if
    # serial_connected never flips true within the bound (e.g. it
    # doesn't reliably do so during some reconnect races - seen in
    # practice after an unplug/replug while Thonny already had a session
    # open) would silently drop the ENTIRE Ctrl-C protection right when
    # it's needed most. So there's no early return: the countdown always
    # runs unconditionally afterward, connected or not - worst case (truly
    # nobody attached) the prints just go nowhere, harmlessly.
    MAX_WAIT_FOR_SERIAL_S = 30
    waited = 0
    while not supervisor.runtime.serial_connected and waited < MAX_WAIT_FOR_SERIAL_S:
        feed()
        led_tick()
        time.sleep(0.25)
        waited += 0.25

    remaining = total_delay_s
    while remaining > 0:
        feed()
        led_tick()
        print(action_description + " in " + str(remaining) + "s - press Ctrl-C now if you need to interrupt boot")
        time.sleep(1)
        remaining -= 1


# pins.py probes each configured Grove I2C sensor (LIS3DHTR, VL53L0X) at
# import time, via board.I2C() calls that can hang at the C driver level
# rather than raising quickly if that bus currently has no pull-ups, a
# disconnected sensor mid-transaction, or similar - a hang like that
# blocks before CircuitPython's VM ever gets a chance to check for a
# Ctrl-C, and can even keep Thonny's Stop button from working (same
# class of problem as wifi.radio.start_ap() below). A "press Ctrl-C now"
# countdown was tried here too, but in practice it didn't actually help
# with the failure mode that mattered (Thonny reconnecting to a board
# that's already mid-boot after an unplug/replug - a Thonny-side
# connection race, not something a countdown printed from this side can
# fix - see the README's Troubleshooting section for the actual
# reliable recovery procedure). Removed rather than kept as dead weight.
from firmata_server import FirmataServer

# pins.py's board.I2C() probe can hang at the C driver level (bus with no
# pull-ups, sensor disconnected mid-transaction). The watchdog, armed
# above, is what recovers that now - it'll reset the board, and the
# reset-loop guard breaks the cycle if it keeps happening.
feed()
from pins import PIN_TABLE, GROVE_SENSOR_CATALOG
feed()

FIRMATA_PORT = 3030

# Not necessarily defined in every CircuitPython build's errno module, so
# hardcoded rather than referenced as errno.ENOTCONN. Seen empirically on
# real XIAO ESP32-C6 hardware: recv_into() can spuriously raise this right
# after accept() returns, before the underlying lwIP connection state has
# finished settling - the connection is actually fine. Only tolerated for
# a brief window after connecting (see CONNECTION_GRACE_PERIOD_S) so a
# genuine later disconnect via this same errno still gets caught.
ENOTCONN = 128
CONNECTION_GRACE_PERIOD_S = 2


def send_all(conn, data):
    # socket.send() returns the number of bytes actually accepted, same
    # as POSIX send() - it can legitimately send fewer than requested
    # (especially right after accept(), before this appears to have
    # caused problems on this hardware) and raising no exception either
    # way, so a bare conn.send(data) can silently drop bytes. This loops
    # until every byte is confirmed sent.
    sent_total = 0
    view = memoryview(data)
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
                # up.
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


def show_ip_on_lcd(ip_address):
    """Best-effort: show this board's IP on an attached Grove LCD RGB
    Backlight (see grove_lcd.py). Entirely optional - any failure (no
    display wired up, wrong I2C address, no I2C bus on this board) is
    swallowed here so a missing display never blocks booting into
    run_server()."""
    try:
        import board
        from grove_lcd import GroveLCD

        # board.I2C() is a shared, cached bus - pins.py's Grove sensor
        # setup (imported before this ever runs) already calls it too, to
        # claim the bus unconditionally even if no sensor responds. This
        # MUST reuse that same call rather than separately claiming
        # board.SDA/board.SCL as raw digitalio pins (a previous version of
        # this function did exactly that, as a best-effort internal
        # pull-up workaround for an old LCD with no pull-ups of its own) -
        # a raw digitalio claim on a pin the I2C peripheral already holds
        # fails outright ("D4 in use"), so that workaround stopped working
        # the moment pins.py started using I2C too. If a display genuinely
        # needs the internal-pullup nudge, it has to happen once, wherever
        # the bus is first opened (currently pins.py) - not re-attempted
        # here on an already-claimed bus.
        lcd = GroveLCD(board.I2C())
        lcd.show_lines("NTK Firmata", str(ip_address) + ":" + str(FIRMATA_PORT))
        lcd.set_rgb(0, 255, 0)
        print("Grove LCD found")
    except Exception:
        # Silently skipped if not attached - "not attached" is the
        # everyday case, not a real error worth printing every boot (see
        # pins.py's matching _found_sensors summary for the same idea).
        pass


def connect_wifi():
    ssid = os.getenv("CIRCUITPY_WIFI_SSID")
    password = os.getenv("CIRCUITPY_WIFI_PASSWORD")
    if not ssid:
        raise RuntimeError(
            "Set CIRCUITPY_WIFI_SSID / CIRCUITPY_WIFI_PASSWORD in settings.toml "
            "(copy settings.toml.example and fill it in)"
        )
    print("Connecting to WiFi:", ssid)
    # wifi.radio.connect() is a single blocking hardware-level call that
    # CircuitPython can't service a keyboard interrupt during - without a
    # timeout it can block for a long, unpredictable time on a flaky
    # network, making the board look completely unresponsive right after
    # a reboot (Ctrl+C silently does nothing until this call returns).
    # Bounding each attempt keeps that unresponsive window short and
    # gives Ctrl+C a window to land between retries, while still
    # eventually connecting on a flaky network same as before.
    while True:
        feed()  # each connect() attempt blocks the VM for up to 10s
        led_tick()
        try:
            if password:
                wifi.radio.connect(ssid, password, timeout=10)
            else:
                wifi.radio.connect(ssid, timeout=10)
            break
        except ConnectionError as e:
            print("WiFi connect attempt failed, retrying:", e)
    feed()
    print("Connected. IP address:", wifi.radio.ipv4_address)
    show_ip_on_lcd(wifi.radio.ipv4_address)


def start_ap():
    """SoftAP mode: the board runs its own WiFi network instead of joining
    one, so it's always reachable at a fixed 192.168.4.1 with no DHCP
    address to discover. See the module docstring for when to use this."""
    # Unlike connect_wifi()'s wifi.radio.connect(), which takes a timeout
    # so Ctrl-C gets a window to land between retries, wifi.radio.start_ap()
    # has no such option - if it hangs, Ctrl-C cannot interrupt it (only
    # Thonny's Stop button can). See _wait_for_ctrl_c_window()'s docstring
    # for why this waits for an actual console connection first, rather
    # than just sleeping - a fixed sleep counts down from power-on, which
    # has usually already elapsed by the time anyone's actually watching.
    _wait_for_ctrl_c_window(8, "Starting SoftAP")

    ssid = os.getenv("NTK_AP_SSID") or "NTK-Firmata"

    # Absent key -> a sensible default password (keeps the network closed
    # by default). An explicit empty string in settings.toml opts into an
    # open network.
    password = os.getenv("NTK_AP_PASSWORD")
    if password is None:
        password = "netlabtoolkit"

    # WPA2 needs an 8-63 character passphrase. Rather than let start_ap()
    # raise and leave the board unreachable, fall back to an open network
    # with a loud warning if the configured password is out of range.
    if password and not (8 <= len(password) <= 63):
        print(
            "NTK_AP_PASSWORD must be 8-63 characters (got %d) - starting an "
            "OPEN network instead." % len(password)
        )
        password = ""

    print("Starting SoftAP:", ssid, "(secured)" if password else "(open)")
    # start_ap() has no timeout and can hang past Ctrl-C's reach. If it
    # hangs longer than the watchdog window the board resets and tries
    # again; the reset-loop guard breaks the cycle after a few tries.
    feed()
    if password:
        wifi.radio.start_ap(ssid, password)
    else:
        wifi.radio.start_ap(ssid)
    feed()

    # Recent CircuitPython starts the AP DHCP server automatically inside
    # start_ap(); older builds need it explicit. Harmless to call when it's
    # already running or absent.
    try:
        wifi.radio.start_dhcp_server()
    except Exception as e:
        print("(start_dhcp_server not needed / unavailable:", e, ")")

    ap_ip = wifi.radio.ipv4_address_ap
    print("SoftAP started. IP address:", ap_ip)
    print(
        "Join WiFi '%s'%s, then point NTK (Device: Network) at %s port %d"
        % (ssid, "" if password else " (open)", ap_ip, FIRMATA_PORT)
    )


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
    server_socket.settimeout(1)
    feed()
    print("Firmata server listening on port", FIRMATA_PORT)
    # WiFi is up and we're listening but nobody's connected yet - switch
    # from the "working on WiFi" blink to the "waiting for a client" one.
    led_set_pattern(_LED_WAITING)

    read_buffer = bytearray(128)

    # If we ran this long without the watchdog firing, this is a healthy
    # boot - forget any earlier watchdog resets so the reset-loop guard
    # starts fresh. Done inside the loop below so a hang that only shows
    # up under load still accumulates toward the guard's limit.
    server_started_at = time.monotonic()
    reset_count_cleared = False

    while True:
        print("Waiting for Client to connect...")
        conn = None
        while conn is None:
            feed()  # accept() blocks the VM for up to 1s per poll
            led_tick()
            if not reset_count_cleared and time.monotonic() - server_started_at > 30:
                clear_reset_loop_count()
                reset_count_cleared = True
            try:
                conn, addr = server_socket.accept()
            except OSError:
                pass  # timed out with no connection yet - keep polling
        try:
            # Disables Nagle, so small packets (most Firmata messages are
            # 2-4 bytes) go out immediately instead of waiting to coalesce.
            conn.setsockopt(pool.IPPROTO_TCP, pool.TCP_NODELAY, 1)
        except Exception:
            pass  # not critical if unsupported on this CircuitPython build
        print("Client connected from", addr)
        led_solid_on()

        firmata = FirmataServer(PIN_TABLE, GROVE_SENSOR_CATALOG)
        # on_connect() just registers the send callback - it deliberately
        # sends nothing itself (see the comment on FirmataServer.on_connect
        # in firmata_server.py for why: NTK's host-side firmata-io library
        # only kicks off its handshake from its own 5-second "no version
        # yet" fallback timer, so NTK will appear to do nothing for up to
        # 5 seconds after "NTK connected" - that's expected, not a hang.
        firmata.on_connect(lambda data: send_all(conn, data))
        conn.settimeout(0)
        connected_at = time.monotonic()

        try:
            while True:
                feed()
                if not reset_count_cleared and time.monotonic() - server_started_at > 30:
                    clear_reset_loop_count()
                    reset_count_cleared = True
                disconnected = False
                in_grace_period = (time.monotonic() - connected_at) < CONNECTION_GRACE_PERIOD_S
                try:
                    n = conn.recv_into(read_buffer)
                    if n == 0:
                        disconnected = True  # peer closed the connection cleanly
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

                if not disconnected:
                    try:
                        firmata.update()
                    except OSError as e:
                        if e.errno != errno.EAGAIN:
                            disconnected = True

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
            led_set_pattern(_LED_WAITING)


wifi_mode = str(os.getenv("NTK_WIFI_MODE") or "station").strip().lower()
if wifi_mode == "ap":
    try:
        start_ap()
    except Exception as e:
        # If SoftAP can't start for any reason, fall back to joining the
        # configured WiFi so the board is still reachable somehow rather
        # than dead on the network.
        print("start_ap() failed:", e, "- falling back to station mode")
        connect_wifi()
else:
    connect_wifi()
run_server()
