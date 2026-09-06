# iPadOS port

**Status:** exploratory, scoped via discussion. Not started.

Port NTK to iPadOS, assuming USB (Arduino) serial support is dropped.
This is plausible and **not a full rewrite** — dropping serial removes
the one truly hard blocker (`@serialport/bindings`, a native Node addon
with no iPadOS sandbox equivalent — no raw USB CDC access for a
third-party app without Apple's separate MFi / ExternalAccessory
certification).

## Core architectural insight

`app/` (the Backbone / Marionette / rivets widget UI) and
`server/modules/nlHardware/*` (the Firmata protocol logic —
`ArduinoModel.js`, `NetworkModel.js`, `StandardFirmataModel.js`,
`Hardware.js`) are almost entirely platform-agnostic JS. They don't need
Node specifically — they need something that can open a raw TCP socket to
a WiFi Firmata device and pass bytes back and forth. Today that's Node's
`net` module in Electron's main process, bridged to the browser UI via
Express / socket.io.

**Recommended shape:** a WKWebView-based native shell (Swift / Xcode)
instead of an Electron `BrowserWindow`, with a small native bridge layer
using `Network.framework`'s `NWConnection` standing in for Node's
`net.Socket`, exposed to the page via `WKScriptMessageHandler` /
`window.webkit.messageHandlers` — the same IPC-bridge shape Electron
already uses (main ↔ renderer), just Swift instead of Node on the native
side. The actual wire-protocol parsing / serialization — the hard,
already-tested part — barely changes: only the handful of
`net.Socket.connect / write / on('data')` call sites get swapped for
bridge calls.

**If the Firmata → native-protocol replacement
([standalone patch export](standalone-patch-export.md), build-order step
5/6) happens first**, this bridge should target that new native protocol
instead of Firmata. The bridge-shape reasoning above (swap socket calls
for bridge calls, reuse the JS parsing logic) applies either way, just
against a different wire format.

## What needs a real native bridge (beyond the TCP socket shim)

- **File save / load** — no Node `fs` on iPadOS; use
  `UIDocumentPickerViewController` / Files app integration instead,
  bridged the same way as the socket shim. Arguably a nicer UX (native
  Files / iCloud browser) than today's userData-folder approach.
- **SpeechIn** — Safari / WebKit has never implemented the Web Speech
  *Recognition* API (only synthesis). Not a regression: SpeechIn is
  already broken in Electron today (its `webkitSpeechRecognition` streams
  audio to Google's servers using a private API key present only in
  official Chrome builds — Electron's Chromium doesn't have it). Making it
  work on iPadOS needs a bridge to Apple's own `SFSpeechRecognizer` — a
  real but well-documented task, and the same bridge a Mac build would
  want. See the speech-to-text notes (currently in Claude memory) for the
  Apple Speech vs. bundled-whisper.cpp comparison.

## What likely just works (needs testing, not re-architecture)

- **PoseTrack / FaceTrack** — `getUserMedia` and WebAssembly both work in
  WKWebView (since ~iOS 14.3), so MediaPipe Tasks Vision should run;
  camera-permission wiring on the native side (Info.plist + the usual
  WKWebView media-capture config) is required but standard. These already
  need live-camera GUI testing even on desktop, so iPadOS support is
  unverified on top of that.
- **CloudIn / CloudOut** (plain `fetch()` to Adafruit IO), **SpeechOut**
  (`speechSynthesis`) — no platform-specific concern.

## What gets dropped or deferred, not ported

- The Express / socket.io layer entirely, `nlMultiClientSync.js`
  (multi-client patch sync), and the "view this patch from another device
  on the LAN" feature (the `/localNetworkInfo` panel). All assume a
  locally-hosted server other devices can reach, which doesn't fit the
  iPadOS sandbox model well. Not strictly impossible (`NWListener` could
  serve a listener role), but out of scope for a v1 port.
- The entire Electron packaging / signing / entitlements pipeline
  (`buildScripts/packageElectron.js`, notarization, etc.) — replaced by a
  normal Xcode / App Store pipeline. A WKWebView-wrapped tool app is an
  accepted App Store pattern (not a "web wrapper" rejection risk) as long
  as it's a genuine self-contained tool, which NTK is.

## Net assessment

Not a full rewrite — most of `app/` and the hardware-protocol JS survive
close to as-is. But a real project: a native bridge layer to design /
build / test (sockets, file I/O, maybe speech), every widget re-verified
under WKWebView, and a brand-new build / distribution pipeline from
scratch.

## Relationship to the desktop app's loopback server

See [README.md](README.md#the-pivot-point-the-loopback-server-change).
The desktop Electron app has the same "server plays two roles" question,
independent of iPad. An iPad port removes Role B's *iPad-specific*
motivating case, but Role B also served `npm start` headless / Pi
deployments — and the more valuable, iPad-independent finding is that
**Role A (internal loopback) is worth replacing with real Electron IPC
regardless.** As of 2026-09-03 the resolution is to do both: replace
Role A with IPC and drop Role B outright.
