# Firmware build: 2026-10-09 14:24 CET - update this (and the matching
# print() further down) on every manual/dev deploy to CIRCUITPY, so
# it's visible both in Thonny's editor view (before even running
# anything - Thonny doesn't always reload a changed file automatically)
# and in the console at boot. A packaged NTK app build overwrites both
# this line and that print() automatically with the app's own release
# version instead (buildScripts/packageElectron.js, staying in sync
# with package.json) - never hand-edit this line to look like a
# release version, that'll just be overwritten at package time anyway.
"""
NTK Firmata bridge for Seeed XIAO ESP32 boards (C6 and S3 Sense both
run from this same directory - only pins.py differs between them;
see its own docstring), running CircuitPython.

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

# A hand-maintained stamp of when these firmware FILES were last
# actually edited, updated by whoever's deploying a change directly to
# CIRCUITPY during active development - or, for a packaged NTK app
# build, the app's own release version, rewritten automatically here by
# buildScripts/packageElectron.js (see the top-of-file comment; never
# hand-edited there). Added 2026-10-01 after several rounds of "did my
# last file copy actually take effect, or is the board still running
# what was there before" during hands-on firmware iteration -
# CircuitPython's auto-reload-on-file-write doesn't always visibly
# trigger (seen hands-on: a board kept running old code until manually
# reset, with no indication anything was wrong), so this is the one
# unambiguous way to confirm what's actually running without
# re-reading every file's own content over serial. Previously paired
# with a separate ntk_version.py (dropped 2026-10-02 as redundant once
# this line started covering the packaged-release case too).
print("Firmware build:", "2026-10-09 14:24 CET")

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

# Must be a module-level global, not a local inside _connect_station() -
# confirmed root cause 2026-09-26 of the mDNS responder going silent
# shortly after WiFi connects (previous attempt, parked 2026-09-23): a
# local variable holding the only reference to mdns.Server() is eligible
# for garbage collection the instant _connect_station() returns, and
# mdns.Server wraps a native responder that a GC pass tears down with
# it - so queries got no answer well before ntk_firmata_main.run() even
# started. A known-working reference script (test/remote-mdns.py) keeps
# its own mdns.Server as a top-level global for the program's entire
# life, never re-assigned or dropped - this mirrors that.
_mdns_server = None

# Optional SSD1306 status display (see oled_display.py's own module
# docstring) - shown here, before the WiFi calls below, so it can
# display "Connecting..." the same way test/boot-with-oled.py's
# original example did. Safe regarding the heap-fragmentation crash
# this file's own docstring warns about (which was traced to the
# CALLING module - i.e. this file - accumulating a lot of its OWN
# compiled function definitions before the WiFi call, not to what gets
# imported): oled_display.init() is one function CALL into an already-
# separately-compiled module, not new function DEFINITIONS added to
# this file's own bytecode. Still new/not yet hardware-soak-tested
# through many boot cycles though - if a mysterious WiFi connect
# failure ever reappears after adding this, suspect this exact
# assumption first, same as the original bug's own history.
import oled_display
oled_display.init()
oled_display.set_mode("connecting")

# Every NTK board advertises under this same service type (see
# advertise_service() below) - used both to actually announce this
# board AND, in _resolve_mdns_hostname() below, to look for OTHER
# boards already using a candidate hostname. One pair of constants so
# the two call sites can't drift apart.
_NTK_MDNS_SERVICE_TYPE = "_ntk"
_NTK_MDNS_PROTOCOL = "_tcp"

_MDNS_RENAME_MAX_ATTEMPTS = 5
_MDNS_COLLISION_PROBE_TIMEOUT_S = 1.0


def _resolve_mdns_hostname(mdns_server, candidate, wdt=None):
    """Best-effort collision check against other NTK boards already on
    this network: query mdns_server.find() for the shared "_ntk"/"_tcp"
    service type above, and if another board's RemoteService.hostname
    already matches, try candidate-2, candidate-3, ... up to
    _MDNS_RENAME_MAX_ATTEMPTS before giving up and returning the
    original candidate unchanged either way - this is a nice-to-have,
    not a guarantee.

    wdt, if given, is fed before each attempt - find() is a single
    blocking native call per attempt, same as wifi.radio.connect()
    elsewhere in this file, so it can't be fed mid-call either. The
    caller already feeds it once right after connect() succeeds and
    before calling this function at all (see _connect_station()'s own
    comment on why), so this is only needed for attempt 2 onward -
    included anyway since it's free and one less thing to get wrong if
    this function's caller ever changes.

    Re-enabled 2026-10-02 after being disabled 2026-10-01. The
    original attempt's "extra positional arguments given" TypeError
    turned out to be a real argument-shape bug, not a sign the whole
    API is unsafe: confirmed via CircuitPython's own shared-bindings
    source (shared-bindings/mdns/Server.c at the 10.3.1 tag) that
    find()'s service_type AND protocol are BOTH keyword-only in this
    build, not positional as the rendered docs site (incorrectly)
    shows - only passing all three as keywords (service_type=...,
    protocol=..., timeout=...) avoids that error. This does NOT touch
    the separate, unexplained hard-fault that happened probing
    mdns.Server.find.__doc__ directly in the REPL - that was a
    different action (introspection, not a call) and is not repeated
    anywhere here.

    Every exception is caught and treated as "couldn't check, use
    candidate as-is" - a crowded network, no responses, or anything
    else going wrong here should never be able to block a boot that
    would otherwise have worked at all."""
    try:
        print("Checking for other NTK boards on this network...")
        for attempt in range(1, _MDNS_RENAME_MAX_ATTEMPTS + 1):
            if wdt is not None:
                try:
                    wdt.feed()
                except Exception:
                    pass
            attempt_hostname = candidate if attempt == 1 else "%s-%d" % (candidate, attempt)
            found = mdns_server.find(
                service_type=_NTK_MDNS_SERVICE_TYPE,
                protocol=_NTK_MDNS_PROTOCOL,
                timeout=_MDNS_COLLISION_PROBE_TIMEOUT_S,
            )
            if not any(s.hostname.lower() == attempt_hostname.lower() for s in found):
                return attempt_hostname
        return candidate  # exhausted every attempt - give up gracefully
    except Exception:
        return candidate


def _connect_station():
    """Plain station-mode join - see the module docstring for why this
    has to run here rather than from ntk_firmata_main.py's old
    connect_wifi() (removed; this replaces it)."""
    ssid = os.getenv("NTK_WIFI_SSID")
    password = os.getenv("NTK_WIFI_PASSWORD")
    if not ssid:
        print(
            "NTK_WIFI_SSID not set in settings.toml - can't join a WiFi "
            "network (copy settings-example.toml and fill it in)"
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
            # Was 20 before the mDNS collision check existed, raised to
            # 30 once that ran too (hardware-verified 2026-10-02 that 20
            # was too tight) - then hit a 3-resets-in-a-row failure at
            # 30 anyway, on a boot where _resolve_mdns_hostname() needed
            # 2 attempts (one found a real collision, one didn't).
            # Working theory: mdns_server.find()'s own timeout=1.0
            # argument may not reliably bound its ACTUAL blocking time -
            # a call that receives and parses a real response is
            # plausibly slower than one that just times out empty, and
            # there's no verified guarantee from CircuitPython's source
            # either way (only its argument-parsing shape was confirmed,
            # not its runtime timing behavior). Since find() is a single
            # blocking native call that can't be fed mid-call (same
            # limitation as connect() above), raised to 60 for a much
            # larger margin against that uncertainty, rather than
            # guessing at a smaller, more "precise" number a third time.
            wdt.timeout = 60
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
    # Reset the watchdog budget right after a successful connect, before
    # anything below (mDNS setup, the collision-check loop) gets to
    # spend any of it - connect() above can itself take most of the 20s
    # window on a slow join, and without this feed here, the mDNS block
    # would only get whatever was left over rather than a fresh 20s of
    # its own. Hardware-verified 2026-10-02: without this feed, a single
    # ~1s mdns_server.find() call in _resolve_mdns_hostname() below was
    # enough to trip 3 watchdog resets in a row on a boot where connect()
    # had already eaten close to the full budget - not a hard fault like
    # the earlier find()-related incident, but still enough to stop
    # Firmata from starting at all.
    if wdt is not None:
        try:
            wdt.feed()
        except Exception:
            pass
    # Default power-save (wifi.PowerManagement.MIN) sleeps the radio
    # between the AP's beacon intervals and only wakes periodically -
    # adds tens-to-hundreds of ms of latency to every packet and can
    # outright drop a one-shot TCP SYN that arrives during a sleep
    # window - wrong for a live Firmata connection's low-latency,
    # always-on traffic. This board runs off USB power throughout, so
    # there's no battery-life reason to keep power-save enabled.
    wifi.radio.power_management = wifi.PowerManagement.NONE

    # On by default - "ntk-device" unless overridden by settings.toml's
    # NTK_MDNS_HOSTNAME (only needed to disambiguate more than one board
    # on the same network). Single fixed hostname, station mode only -
    # so a user can point NTK at "<hostname>.local" instead of having to
    # read the DHCP-assigned IP off this console. Deliberately v1-scoped:
    # no discovery/browsing, no per-board auto-derived name. Runs from
    # here (inside _connect_station(), not the top-level wifi_mode
    # branch) so it also covers the AP-start-failed fallback path below,
    # which ends up here too - any time we actually have a real DHCP
    # lease, advertising it makes sense. Not every CircuitPython build
    # ships the mdns module, hence the broad except.
    #
    # Runs BEFORE the "Connected" print below (not after, as it used to)
    # so a successful hostname setup can be folded into that same line
    # instead of printed as a separate line afterward - keeps the
    # console output to one line for the common case.
    mdns_hostname = os.getenv("NTK_MDNS_HOSTNAME") or "ntk-device"
    mdns_suffix = ""
    # NTK_MDNS_HOSTNAME = "none" is the explicit opt-out - anything else
    # (including it being absent entirely) leaves mDNS on by default.
    if mdns_hostname.lower() != "none":
        global _mdns_server
        try:
            import mdns
            _mdns_server = mdns.Server(wifi.radio)
            # Best-effort auto-rename if another NTK board already
            # claims this hostname - see _resolve_mdns_hostname()'s own
            # docstring for exactly how (and its real limits/NOT YET
            # hardware-verified caveat). A no-op, returning mdns_hostname
            # unchanged, if nothing else is found or the check itself
            # fails for any reason.
            resolved_hostname = _resolve_mdns_hostname(_mdns_server, mdns_hostname, wdt)
            if resolved_hostname != mdns_hostname:
                print(
                    "mDNS name '%s.local' already in use on this network - "
                    "using '%s.local' instead" % (mdns_hostname, resolved_hostname)
                )
                mdns_hostname = resolved_hostname
            _mdns_server.hostname = mdns_hostname
            # Setting .hostname alone does NOT make the responder answer
            # queries - confirmed live on real hardware 2026-09-23 (a
            # dns-sd query against the board got zero response until
            # this was added). advertise_service() is what actually
            # activates the mDNS responder; the service itself doesn't
            # need to mean anything to NTK, since only the hostname's
            # own A-record lookup matters here, not service discovery.
            _mdns_server.advertise_service(
                service_type=_NTK_MDNS_SERVICE_TYPE, protocol=_NTK_MDNS_PROTOCOL, port=FIRMATA_PORT
            )
            mdns_suffix = " (also reachable at %s.local port %d)" % (mdns_hostname, FIRMATA_PORT)
        except Exception as e:
            print("(mDNS unavailable:", e, ")")

    print("Connected. IP address: %s%s" % (wifi.radio.ipv4_address, mdns_suffix))
    # Only shown once mDNS is confirmed actually active (mdns_suffix
    # non-empty means advertise_service() succeeded above) - "" clears
    # the line instead of showing a stale/wrong value if mDNS is
    # disabled or failed to set up.
    oled_display.set_status(
        ip=str(wifi.radio.ipv4_address),
        hostname=(mdns_hostname + ".local") if mdns_suffix else "",
    )
    try:
        print("Signal strength: RSSI", wifi.radio.ap_info.rssi, "channel", wifi.radio.ap_info.channel)
        oled_display.set_status(rssi=wifi.radio.ap_info.rssi)
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

        # mDNS on the board's own network too, so NTK can be pointed at
        # the same "<hostname>.local" in SoftAP mode as in station mode
        # instead of the special 192.168.4.1. Same on-by-default /
        # NTK_MDNS_HOSTNAME = "none" opt-out as _connect_station(), kept
        # in the same module-level _mdns_server global for the same
        # reason (see its comment above). No collision check here: this
        # is the board's own network, there is no other NTK board on it
        # to collide with - and _resolve_mdns_hostname()'s blocking
        # find() isn't something to add to a path that runs with no
        # watchdog. Inline rather than a helper function, per this
        # file's rule about not adding function defs ahead of
        # start_ap(). Best effort: a failure here (or a build whose
        # responder only answers on the station interface) leaves the
        # fixed IP working exactly as before.
        ap_hostname = os.getenv("NTK_MDNS_HOSTNAME") or "ntk-device"
        ap_mdns_suffix = ""
        if ap_hostname.lower() != "none":
            try:
                import mdns
                _mdns_server = mdns.Server(wifi.radio)
                _mdns_server.hostname = ap_hostname
                # advertise_service() is what actually activates the
                # responder - see _connect_station().
                _mdns_server.advertise_service(
                    service_type=_NTK_MDNS_SERVICE_TYPE, protocol=_NTK_MDNS_PROTOCOL, port=FIRMATA_PORT
                )
                ap_mdns_suffix = " (or %s.local)" % ap_hostname
            except Exception as e:
                print("(mDNS unavailable in SoftAP mode:", e, ")")

        print("SoftAP started. IP address: %s%s" % (ap_ip, ap_mdns_suffix))
        # "AP " ahead of the address is the only on-screen sign that the
        # board is running its own network rather than having joined one
        # - the two look identical otherwise, and the address is the
        # wrong thing to try from a computer still on its usual WiFi.
        oled_display.set_status(
            ip="AP %s" % ap_ip,
            hostname=(ap_hostname + ".local") if ap_mdns_suffix else "",
        )
        print(
            "Join WiFi '%s'%s, then point NTK (Device: Network) at %s%s port %d"
            % (ssid, "" if password else " (open)", ap_ip, ap_mdns_suffix, FIRMATA_PORT)
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
