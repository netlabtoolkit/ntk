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

`start_ap()` in `code.py` + module-level dispatch before `run_server()`
(which is untouched, still binds `0.0.0.0`); `start_dhcp_server()` wrapped
in try / except; `start_ap()` failure falls back to `connect_wifi()`. The
board is then reachable at a fixed **`192.168.4.1:3030`** with no IP to
discover. There's a Ctrl-C window before the uninterruptible `start_ap()`
call (see `_wait_for_ctrl_c_window()`).

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
