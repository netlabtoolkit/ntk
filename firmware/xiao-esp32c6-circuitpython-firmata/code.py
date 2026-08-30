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
"""

import errno
import os
import time
import wifi
import socketpool

from firmata_server import FirmataServer
from pins import PIN_TABLE

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
        try:
            if password:
                wifi.radio.connect(ssid, password, timeout=10)
            else:
                wifi.radio.connect(ssid, timeout=10)
            break
        except ConnectionError as e:
            print("WiFi connect attempt failed, retrying:", e)
    print("Connected. IP address:", wifi.radio.ipv4_address)


def start_ap():
    """SoftAP mode: the board runs its own WiFi network instead of joining
    one, so it's always reachable at a fixed 192.168.4.1 with no DHCP
    address to discover. See the module docstring for when to use this."""
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
    if password:
        wifi.radio.start_ap(ssid, password)
    else:
        wifi.radio.start_ap(ssid)

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
    print("Firmata server listening on port", FIRMATA_PORT)

    read_buffer = bytearray(128)

    while True:
        print("Waiting for Client to connect...")
        conn = None
        while conn is None:
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

        firmata = FirmataServer(PIN_TABLE)
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
