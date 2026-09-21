"""
NTK Firmata bridge for the Seeed XIAO ESP32-C6, running CircuitPython.

This file is deliberately tiny - see ntk_firmata_main.py for the real
logic (status LED, watchdog, the Firmata server itself, GroveSensor/
standalone-patch support, etc) and for setup/usage instructions. WiFi
setup (station join or SoftAP) happens right here instead - see below.

Both SoftAP (settings.toml NTK_WIFI_MODE=ap) and normal station-mode
WiFi join have to happen here, in this small file, BEFORE
ntk_firmata_main is ever imported.

Hardware-verified 2026-09-19: wifi.radio.start_ap() reliably hard-
faults ("Hard fault: memory access or instruction error" - a native
crash, not a catchable Python exception) when called from inside a
module that already has a lot of its own function definitions
compiled (like ntk_firmata_main, mainly because of run_server()'s
size) - a heap-fragmentation conflict with the WiFi driver's own
allocation, not a timing, watchdog, or LED issue as first suspected.
Ruled out via hardware bisection, each confirmed on real hardware: the
crash persisted with the watchdog deliberately left unarmed the whole
time, with the LED/reset-guard/escape-hatch code removed, and with
pins.py/firmata_server.py's imports removed - so long as the call
still happened from within a module with ntk_firmata_main's full set
of function definitions already compiled. It also persisted with
start_ap() itself inlined (no function-call indirection) and with
gc.collect() run immediately beforehand (plenty of free memory - this
isn't about total free bytes, just where start_ap() is called from).
It disappeared the instant the exact same call ran from a file with
only a handful of top-level statements and no large function defs -
even immediately before importing that same large module.

Same day, same finding for wifi.radio.connect() (plain station-mode
join): it failed every time with "Unknown failure 205" when called
from ntk_firmata_main.py's connect_wifi() (after that module - and its
own imports of firmata_server.py/pins.py - had already been imported),
but succeeded instantly, every time, called bare at the REPL. So
station-mode join moved here too, for the same reason - it's not
actually about SoftAP specifically, it's about calling either WiFi
entry point from inside a module with a lot of compiled code already
resident. Moving either call back into ntk_firmata_main.py would
silently reintroduce its respective failure.
"""

import os
import sys
import time
import supervisor
import wifi
import microcontroller

try:
    import watchdog as _watchdog
except ImportError:  # not every CircuitPython build ships it
    _watchdog = None

# A byte on the serial console in the next few seconds drops straight
# to the REPL, before anything below can hang or crash. Kept here,
# inline, rather than as an imported helper - importing anything with
# its own function definitions before start_ap() runs below risks the
# same heap-fragmentation crash described above.
_window_s = 4 if supervisor.runtime.serial_connected else 3
print(
    "NTK Firmata booting - press any key in the next %ds for the REPL..."
    % _window_s
)
_deadline = time.monotonic() + _window_s
while time.monotonic() < _deadline:
    if supervisor.runtime.serial_bytes_available:
        print("Interrupted - dropping to the REPL.")
        sys.exit()
    time.sleep(0.05)

wifi_mode = str(os.getenv("NTK_WIFI_MODE") or "station").strip().lower()

FIRMATA_PORT = 3030


def _connect_station():
    """Plain station-mode join - see the module docstring for why this
    has to run here rather than from ntk_firmata_main.py's old
    connect_wifi() (removed; this replaces it)."""
    ssid = os.getenv("NTK_WIFI_SSID")
    password = os.getenv("NTK_WIFI_PASSWORD")
    if not ssid:
        print(
            "NTK_WIFI_SSID not set in settings.toml - can't join a WiFi "
            "network (copy settings.toml.example and fill it in)"
        )
        return
    print("Connecting to WiFi:", ssid)

    # Watchdog protection for this call specifically - confirmed safe on
    # real hardware 2026-09-19 (unlike start_ap(), an armed watchdog
    # doesn't make wifi.radio.connect() itself fail). Station-mode only:
    # AP mode's start_ap() above still runs with no watchdog at all, per
    # this file's own module docstring and ntk_firmata_main.run()'s
    # comment on the ongoing (not just call-time) SoftAP conflict.
    wdt = None
    if _watchdog is not None:
        try:
            wdt = microcontroller.watchdog
            wdt.timeout = 20  # > wifi.radio.connect()'s own 10s timeout
            wdt.mode = _watchdog.WatchDogMode.RESET
            wdt.feed()
        except Exception as e:
            print("(watchdog unavailable:", e, ")")
            wdt = None

    # wifi.radio.connect() is a single blocking hardware-level call that
    # CircuitPython can't service a keyboard interrupt during - without a
    # timeout it can block for a long, unpredictable time on a flaky
    # network. Bounding each attempt keeps that unresponsive window
    # short and gives Ctrl+C a window to land between retries, while
    # still eventually connecting on a flaky network.
    while True:
        if wdt is not None:
            try:
                wdt.feed()
            except Exception:
                pass
        try:
            if password:
                wifi.radio.connect(ssid, password, timeout=10)
            else:
                wifi.radio.connect(ssid, timeout=10)
            break
        except ConnectionError as e:
            print("WiFi connect attempt failed, retrying:", e)
    # Default power-save (wifi.PowerManagement.MIN) sleeps the radio
    # between the AP's beacon intervals and only wakes periodically -
    # adds tens-to-hundreds of ms of latency to every packet and can
    # outright drop a one-shot TCP SYN that arrives during a sleep
    # window - wrong for a live Firmata connection's low-latency,
    # always-on traffic. This board runs off USB power throughout, so
    # there's no battery-life reason to keep power-save enabled.
    wifi.radio.power_management = wifi.PowerManagement.NONE
    print("Connected. IP address:", wifi.radio.ipv4_address)
    try:
        print("Signal strength: RSSI", wifi.radio.ap_info.rssi, "channel", wifi.radio.ap_info.channel)
    except Exception:
        pass


ap_started = False
if wifi_mode == "ap":
    ssid = os.getenv("NTK_AP_SSID") or "NTK-Firmata"

    # Absent key -> a sensible default password (keeps the network
    # closed by default). An explicit empty string in settings.toml
    # opts into an open network.
    password = os.getenv("NTK_AP_PASSWORD")
    if password is None:
        password = "netlabtoolkit"

    # WPA2 needs an 8-63 character passphrase. Rather than let
    # start_ap() raise and leave the board unreachable, fall back to
    # an open network with a loud warning if the configured password
    # is out of range.
    if password and not (8 <= len(password) <= 63):
        print(
            "NTK_AP_PASSWORD must be 8-63 characters (got %d) - starting an "
            "OPEN network instead." % len(password)
        )
        password = ""

    print("Starting SoftAP:", ssid, "(secured)" if password else "(open)")
    try:
        if password:
            wifi.radio.start_ap(ssid, password)
        else:
            wifi.radio.start_ap(ssid)

        # Hardware-verified 2026-09-19: without this, wifi.radio.stations_ap
        # can show a joined client with zero IP assigned - the network
        # connects but nothing can actually reach 192.168.4.1 (symptom:
        # NTK either gets no connection at all, or one value then
        # silence). The method is named start_dhcp_ap() on this
        # CircuitPython build/version - a previous version of this line
        # called the nonexistent start_dhcp_server(), which silently
        # raised AttributeError and was swallowed by this same try/except,
        # so the DHCP server never actually started. getattr() here so an
        # older/newer build lacking either name just skips this (matching
        # the original intent: harmless to call when it's already running
        # via start_ap() or the method doesn't exist on this build).
        try:
            if hasattr(wifi.radio, "start_dhcp_ap"):
                # A stop+start rather than a bare start: seen on real
                # hardware 2026-09-19 - a joining client can associate
                # fine (shows up, no error) but never get a lease,
                # self-assigning a 169.254.x.x address instead -
                # intermittently, not on every boot. Suspected cause: the
                # AP's network interface isn't always fully settled the
                # instant start_ap() returns, so a DHCP server started
                # immediately after can silently bind against a
                # not-yet-ready netif. stop_dhcp_ap() first (harmless if
                # it wasn't running) plus the settle delay gives the
                # netif a moment before the real start.
                try:
                    wifi.radio.stop_dhcp_ap()
                except Exception:
                    pass
                time.sleep(0.5)
                wifi.radio.start_dhcp_ap()
            elif hasattr(wifi.radio, "start_dhcp_server"):
                wifi.radio.start_dhcp_server()
        except Exception as e:
            print("(start_dhcp_ap not needed / unavailable:", e, ")")

        ap_ip = wifi.radio.ipv4_address_ap
        print("SoftAP started. IP address:", ap_ip)
        print(
            "Join WiFi '%s'%s, then point NTK (Device: Network) at %s port %d"
            % (ssid, "" if password else " (open)", ap_ip, FIRMATA_PORT)
        )
        ap_started = True
    except Exception as e:
        # If SoftAP can't start for any reason, fall back to joining
        # the configured WiFi so the board is still reachable somehow
        # rather than dead on the network.
        print("start_ap() failed:", e, "- falling back to station mode")
        _connect_station()
else:
    _connect_station()

import ntk_firmata_main

ntk_firmata_main.run(ap_started, FIRMATA_PORT)
