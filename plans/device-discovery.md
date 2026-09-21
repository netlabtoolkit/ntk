# Device discovery

Connecting NTK to a WiFi CircuitPython board without reading the
DHCP-assigned IP off a serial console.

**Problem:** NTK needs the board's `IP:port` to connect a Network-mode
widget, and (in station mode) the only way to learn the DHCP IP is
watching the serial console.

## SoftAP mode — DONE

Committed and hardware-tested (2026-08-30; commits `30c935a` and
follow-ups). `settings.toml` key `NTK_WIFI_MODE = "station"` (default) |
`"ap"`, plus `NTK_AP_SSID` (default `NTK-Firmata`) / `NTK_AP_PASSWORD`
(default `netlabtoolkit`; explicit `""` = open; 8–63 char WPA2 rule
enforced with graceful fallback to open).

`start_ap()` logic (now inlined directly in `code.py`, not a separate
function - see below) + fallback to `connect_wifi()` in `ntk_firmata_main.py`
on any exception; `start_dhcp_server()` wrapped in try/except. The board
is then reachable at a fixed **`192.168.4.1:3030`** with no IP to discover.

**Hardware bug found and fixed 2026-09-19**: `wifi.radio.start_ap()`
reliably hard-faulted ("Hard fault: memory access or instruction error" -
a native crash, not a catchable Python exception) when called from
anywhere inside the original single-file `code.py`, which had grown a lot
of its own function definitions (mainly `run_server()`). Root cause,
confirmed via extensive hardware bisection on the real board: this is a
heap-fragmentation conflict between the WiFi driver's own allocation and
CircuitPython's compiled representation of a large module - not a timing,
watchdog, or LED issue as first suspected (each individually ruled out:
the crash persisted with the watchdog deliberately left unarmed the whole
time, with the LED/reset-guard/escape-hatch code removed, with pins.py/
firmata_server.py's imports removed, with the call inlined with no
function-call indirection, and with `gc.collect()` run immediately
beforehand - plenty of free memory, so not about total free bytes, just
about *where* `start_ap()` is called from). It disappeared the instant the
same call ran from a file with only a handful of top-level statements and
no large function defs, even immediately before importing that same large
module.

**Fix:** split `code.py` into a tiny bootstrap (does only the escape
hatch and, for AP mode, the SoftAP bring-up itself - the only things
that run before any large function definitions exist) and
`ntk_firmata_main.py` (everything else - LED, watchdog, reset-loop guard,
`connect_wifi()`, `run_server()`, GroveSensor/standalone-patch loading -
imported only *after* WiFi is already up). Verified on real hardware:
several clean reboots in AP mode and one in station mode, all reset via
`microcontroller.reset()`, no crashes. See the comment at the top of
`code.py` for the full writeup - it's the definitive reference if this
resurfaces (e.g. if AP-mode logic ever migrates back into the main
module).

**Range caveat:** same radio as station mode, but usable range is shorter
in practice — the link is now laptop ↔ the XIAO's weak onboard antenna
with no router / mesh / diversity. Recommend the XIAO ESP32-C6
external-antenna variant if relying on SoftAP. This is why mDNS-on-real-WiFi
stays the intended default.

## mDNS advertising — planned, the intended default

Not built. In `code.py` (station mode), run CircuitPython's `mdns` module
and advertise `_ntk-firmata._tcp` with an instance name from
`settings.toml` (default e.g. `ntk-<last 2 bytes of MAC>`).

- **Minimal version:** user types `ntk-xxxx.local` in the Device field
  instead of an IP. `NetworkModel.js` needs no change — Node's
  `net.connect` resolves `.local` via the OS on macOS. ~10 lines of
  firmware.
- **Polished follow-on:** NTK's server browses mDNS with a pure-JS lib
  (`multicast-dns` / `bonjour-service`, no native deps) and the ToolBar
  Device picker shows discovered boards in a dropdown
  ("ntk-a4f3 (192.168.1.42)").
- **Caveats:** blocked on some enterprise / guest WiFi (client
  isolation); Windows needs Bonjour installed.

## Lower-priority fallbacks (no code)

- DHCP reservation, or `wifi.radio.set_ipv4_address()` static IP from
  `settings.toml`.
- UDP broadcast beacon + a discovery button (more work, defeated by AP
  broadcast filtering).

## Related

The deferred firmware idea of showing IP + port on a Grove OLED at boot
becomes a nice-to-have rather than the connection mechanism once mDNS /
SoftAP exist. All of this is independent of and can precede the GroveIn
sensor work. The [standalone patch export](standalone-patch-export.md)
push-to-device idea builds on the SoftAP precedent.
