# Cloud widgets (CloudIn / CloudOut)

**Status:** app-side MQTT rewrite (build order step 1) built and
**working, confirmed by the user 2026-09-24** after a long debugging
session that found and fixed a real chain of bugs (full list below) -
the last and deepest being an empty-mappings wipe triggered during
patch load. Fresh CloudIn/CloudOut widgets, configured from the
toolbar, connect and pass live data both ways reliably. **Still not
stress-tested**: multiple CloudIn/CloudOut pairs at once beyond the
basic pair, reconfiguring host/port/topic on an already-connected
widget repeatedly, a save/reload round-trip with ALL current fixes in
place (the confirmed-working test was on freshly-added widgets, not a
reloaded saved patch - worth a follow-up check), behavior on a
non-Adafruit broker under sustained use. Also verified against
`test.mosquitto.org` (plain, no auth) earlier in the same debugging
session, but only briefly. Promotes CloudIn/CloudOut out of
`standalone-patch-export.md`'s "gray area, deferred" bucket, the
same way OSCIn/OSCOut were promoted out of it and built 2026-09-23. Step
2 (standalone on-device support) and step 3 (docs) not started.

**Real bugs found and fixed during the 2026-09-24 build:**
- `CloudModel.js`'s `connect()` read `this.address`/`this.port` for the
  broker URL - but `nlHardware/Hardware.js` deliberately overwrites
  `model.address` with the FULL `"Cloud:host:port"` key right after
  construction (used elsewhere to broadcast changes under the exact
  instance key clients expect - see `bindModelToTransport`), so by the
  time `connect()` ran, `this.address` was the whole key, not the bare
  hostname. Produced a malformed URL,
  `mqtt://Cloud:io.adafruit.com:1883:1883`. Fixed by capturing `address`/
  `port` as closure variables at construction time instead of reading
  `this.*` later - same class of bug as OSC.js already sidesteps by not
  relying on `this.address` for anything network-related.
- **Not a code bug, but cost real debugging time:** a connect-then-
  immediately-disconnect loop against Adafruit IO, with a clean
  `returnCode: 0` CONNACK every time. Root-caused via Adafruit IO's own
  dashboard error log (the fix - checking there - should've come sooner
  than it did): `MQTT ERROR: ... PUBLISH to topic 'light' rejected,
  topic is not a recognized format`. Adafruit IO requires
  `<username>/feeds/<feed_key>` and apparently responds to a malformed-
  topic publish by dropping the whole connection, not just rejecting
  that one message - worth remembering for anyone debugging a similar
  "connects fine, dies immediately" symptom against Adafruit IO
  specifically. Two other real candidates were ruled out first (not
  wasted - genuine bugs in their own right): the URL bug above, and
  killing the dev Electron process via `kill <pid>` (repeatedly, across
  this debugging session) instead of a graceful quit, which left a
  second zombie Electron+server process running in the background,
  independently competing for the same MQTT session - confirmed via
  `ps aux` showing two full Electron process trees. Neither was the
  actual cause, but both were real gaps (see the "current" open items
  below).
- Diagnostic methodology that worked: isolating a bare Node script with
  the `mqtt` package against `test.mosquitto.org` first, matching how
  earlier CircuitPython standalone bugs got isolated - confirmed the
  library itself was fine before suspecting the app's integration code.
- **Shared-connection credential fight, found right after the topic-format
  fix above**: `CloudModel.js`'s `connect()` originally compared
  incoming username/password/tls against what it connected with last
  time, and reconnected on any apparent change - intended to let a
  widget's corrected credentials take effect. But every widget sharing
  a broker's model independently resends ITS OWN credentials on every
  `setIOMode` call, and `CloudOut.js`'s `enableDevice()` calls that on
  every value change, not just once - so two widgets on the same broker
  (a CloudIn and a CloudOut both pointed at Adafruit IO, the exact
  setup being tested) fought continuously, each reconnect tearing down
  the other's just-established subscription before it could ever
  receive anything. Symptom: CloudIn showed "Connected" (status events
  fire correctly) but never got data. **Fixed** by making `connect()` a
  hard no-op once `this.client` exists, full stop, regardless of
  credentials - first widget to connect on a given host:port wins for
  that connection's whole lifetime. Known limitation from this fix: an
  already-connected broker with wrong saved credentials on one widget
  won't pick up a correction without removing and re-adding a widget
  (forces the shared model to be recreated) - acceptable for now, not
  worth solving until it's a real complaint rather than a hypothetical.
- **CloudIn/CloudOut had no `onExternalAddWidget` bootstrap case at all**
  (`Patcher.js`) - every OTHER hardware widget type (AnalogIn, OSCIn,
  OSCOut, etc.) has an explicit case there calling `mapToModel` at
  creation time, which both populates `this.sources` and - critically -
  syncs the mapping to the server's `masterPatch.mappings` immediately
  (when `addedFromLoader` is false). Without one, Cloud widgets were
  entirely self-bootstrapping, and their mapping never reached the
  server at all until something else happened to trigger a sync. Added
  matching cases for both, mirroring OSCIn/OSCOut.
- **CloudIn's own bootstrap connect fired before it could possibly have
  a real topic.** Even after the above fix, `mapToModel`'s hardware
  branch auto-invokes `enableDevice()` right at widget creation (since
  `active` is already `true` by then) - but `topic` is still `''` at
  that exact moment, and the server's `client:changeIOMode` handler
  silently no-ops on an empty topic (`if (options.port && options.mode)`).
  So that first, only-ever-fired subscribe request was always a no-op,
  and nothing re-sent it once the user actually typed a topic in -
  CloudIn's topic-change listener only updated bookkeeping
  (`updateModelMappings`), never re-triggered the actual subscribe.
  **Fixed** by having that same listener call `enableDevice()` whenever
  `topic` changes to a non-empty value. Also removed CloudIn's now-
  redundant leftover `window.setTimeout(...)` bootstrap trigger (a holdover
  from when CloudIn had no bootstrap path at all) - it was firing a
  second `Widget:hardwareSwitch` 200ms after the new one from
  `onExternalAddWidget`, which could race with a mapping-sync landing in
  between and recreate the connection.
- **`nlMultiClientSync.js`'s `OUTPUT_TYPE_IDS` list was missing
  `CloudOut`.** This list exists specifically so `pruneHardwareModelIfUnused`
  checks the right field (`active` vs `activeOut`) per widget type -
  without CloudOut in it, its connection was checked against `active`
  (a field CloudOut never sets at all, only `activeOut`), which read as
  `undefined === true` -> always false -> "not wanted", regardless of
  the real `activeOut` state. The OPPOSITE failure from what this list's
  own comment describes guarding against (a stuck-on connection) - this
  one could prune a genuinely-active CloudOut connection out from under
  itself. Added `CloudOut: true`.
- **End-to-end success confirmed** after all of the above: server-side
  per-message logging showed many genuinely distinct live values
  (`468.57 -> 477.02 -> 630.39 -> ...`) arriving continuously on
  CloudIn via real-time CloudOut publishes through Adafruit IO - not
  just an initial retained message. The full pipeline (publish -> broker
  -> subscribe -> server relay -> client model -> widget display) works.
  Testing then tripped Adafruit's own rate limit (30 points/minute),
  which manifested as `Connection refused` on reconnect for BOTH
  widgets (they share one connection) - not a bug, expected broker
  behavior under load; the client's existing `reconnectPeriod: 5000`
  auto-recovers once the cooldown passes, no code change needed.
- **Status display stale when joining an already-connected broker.**
  After a fresh empty-patch restart, server logging proved messages
  WERE arriving continuously on CloudIn, but its own "Connected"
  indicator stayed stuck on "Not connected" - `'status'` is only
  emitted from the client's own connect/reconnect/close/error events,
  none of which fire again just because a second widget joins an
  already-live connection. **Fixed** by having `connect()`'s no-op path
  re-emit the CURRENT status immediately, so a newly-joining widget's
  listener gets an accurate read right away instead of waiting for an
  event that may never come again.
- **Regression from the credential-fight fix, found immediately after
  the fix above**: the "first client to connect wins" guard was too
  strict - if the FIRST widget to bootstrap did so with blank/wrong
  credentials (fields not filled in yet) and the broker rejected it
  ("Bad username or password"), every later, correctly-configured
  widget was permanently blocked from ever connecting too, since
  `this.client` already existed. **Fixed** by tracking `everConnected`
  (only true once a real CONNACK success has happened) - a client that
  never once succeeded can still be replaced by a later attempt with
  different credentials; a client that's actually working is still
  fully protected from being torn down by a credentials mismatch.
- **CloudOut now defaults `sendInterval` to 2000ms** (was 0/uncapped) -
  safe headroom under Adafruit IO's 30/min limit out of the box, per
  explicit request after hitting that limit during testing.
- **CloudOut no longer auto-reconnects on patch load**, regardless of
  what `activeOut` was saved as - overrides `setFromModel` to always
  load deactivated. Explicit request: repeated test restarts kept
  silently re-opening a real MQTT connection and consuming a rate-
  limited broker's quota just from loading a saved patch. The user now
  re-checks the box deliberately each time. Every other output widget
  (AnalogOut/DigitalOut/Servo) keeps the base class's normal
  restore-and-resume behavior - this override is CloudOut-specific,
  not a change to shared code.
- **CloudIn had no connection-establishing trigger beyond `topic`
  changing.** Filling in host+topic before username/password (a
  natural order) sent one real subscribe request with blank
  credentials, which the broker rejected - and nothing ever retried
  with the real credentials once they were filled in, since only
  `topic` changing called `enableDevice()`. CloudIn only ever "worked"
  when some OTHER widget's later, correctly-credentialed connect
  happened to succeed and swept CloudIn's already-seeded topic into its
  resubscribe - which looked exactly like "CloudIn depends on CloudOut
  being connected," but was never a real architectural dependency, just
  this gap. **Fixed** by re-triggering `enableDevice()` on ANY of
  {topic, host, port, tls, username, password} changing (previously
  topic only). Also **the connect checkbox itself never did anything** -
  gated display only, never called `enableDevice()`. Fixed: checking it
  now attempts a connection if a topic is set.
- **CloudIn's own display could lag behind an already-cached value.**
  When the checkbox is checked, `syncWithSource` runs immediately but
  may find nothing cached yet if the value hasn't arrived over the wire.
  Fixed by explicitly re-running the sync loop right after toggling
  active, pulling whatever's already cached on the shared hardware
  model rather than only reacting to the next incoming message.
- **Root cause of "CloudIn shows no data" finally found, via the
  `hardwareModelInstances` DevTools inspection above plus new
  `close()`/prune logging**: a genuine regression in the very fix meant
  to solve the ORIGINAL registration-gap bug. `PatchLoader.js` sets
  EVERY widget's full saved field data (`setFromModel`, one loop) BEFORE
  processing ANY widget's hardware mapping (`mapFunction`, a separate,
  later loop) - so when a saved patch loads and sets CloudIn's `topic`
  to its real saved value, the topic-change listener's
  `updateModelMappings` trigger fired with
  `window.app.Patcher.Controller.widgetMappings` still GLOBALLY EMPTY
  (no widget's mapping established yet, not just this one's). The
  server's `client:updateModelMappings` handler does a full replace
  (`self.masterPatch.mappings = JSON.parse(mappings)`), so an empty
  array wiped out every hardware connection's registration at once -
  including CloudOut's, whose connection had just been (or was about
  to be) established. Confirmed via `nlMultiClientSync.js` logging
  showing `pruneOrphanedHardwareModels deleting Cloud:io.adafruit.com:1883
  - stillReferencedKeys: []` moments after a successful connect.
  **Fixed** by guarding that trigger on `this.sources.length > 0` - only
  non-zero once THIS widget's own `mapToModel` has actually run, which
  structurally cannot happen before PatchLoader's mapping loop starts.
  This was the real explanation for the whole "no data" saga, not a
  broker retained-message quirk as first suspected.
- **CloudOut's `sendInterval` throttle didn't actually throttle
  anything** - real bug, not a misconfiguration. The client-side
  `throttledSync`/`doSync` wrapper only gated `syncWithSource` calls
  from CloudOut's own `onModelChange`, but `WidgetMulti.js`'s base class
  ALSO binds `checkOutputMappingUpdate` directly to every model change
  (`WidgetMulti.js:57`), which calls `enableDevice()` unconditionally
  the moment `out` changes and `activeOut` is true - a second, parallel
  path with no throttle at all. And `syncWithSource`'s own output branch
  sets the shared hardware model directly, bypassing `enableDevice()`
  entirely - a third path. No single client-side chokepoint existed.
  **Fixed by moving the throttle server-side**, into `CloudModel.js`'s
  `set()` - the one point every publish, from any path, necessarily
  passes through before reaching the wire. `sendInterval` now threads
  through `Widget:hardwareSwitch`'s payload into `setIOMode`, stored
  per-topic (`sendIntervals[topic]`) since one broker connection can
  carry multiple CloudOut widgets. CloudOut.js's now-dead client-side
  throttle code removed.
- **The "more" panel closed itself while editing.** `mapToModel` calls
  `view.render()` internally, and `WidgetMulti.js`'s own `onRender`
  unconditionally hides `.widgetBottom .content` every render - fine
  for a widget that rarely reconnects, but CloudIn/CloudOut call
  `mapToModel` on host/port edits, which happen WHILE the user is
  actively filling in fields inside that same panel. Fixed with a
  `mapToModelKeepingPanelOpen` helper (both widgets) that snapshots the
  panel's visibility before calling `mapToModel` and restores it right
  after (synchronous - `render()` completes before `mapToModel` returns).

**Post-fix additions, same session (2026-09-24), after the user confirmed
it working:**
- **`averageInputs` brought back**, matching the OLD CloudOut's option
  of the same name (accumulate every value seen during the wait period,
  publish the mean instead of just the latest). Lives server-side in
  `CloudModel.js`'s `set()`, same reasoning as the `sendInterval`
  throttle it sits alongside (per-topic state, since that's the one
  chokepoint every publish path passes through) - accumulates
  `pendingSum`/`pendingCount` per topic on every `set()` call, publishes
  `Math.round(sum/count)` when the throttle window closes, resets after.
  Threaded through the same `Widget:hardwareSwitch` -> `setIOMode`
  path as `sendInterval`. New `avg` checkbox on CloudOut. **Verified
  correct via diagnostic logging** (42 accumulated samples averaged to
  exactly the right value) - initially looked broken ("always lands on
  the last value") because CloudIn and CloudOut were both pointed at the
  SAME topic for convenience during testing. MQTT 3.1.1 has no way to
  suppress a client receiving its own published messages back when it's
  also subscribed to that same topic - Adafruit's broker echoes every
  CloudOut publish straight back to the connection, and CloudOut's own
  sync logic (bound to the same shared hardware-model instance CloudIn
  uses) treats that echo as a fresh value and republishes it
  immediately, masking the real averaged value with a same-value
  "1-sample average" right after. Confirmed via Adafruit's own dashboard
  with CloudIn removed from the loop: the averaging is correct - the
  self-echo was purely a testing-setup artifact, not a math bug.
  **Actually fixed at the code level** (not just a "use a different
  topic" workaround, since that guidance didn't stick across several
  retests): `CloudModel.js`'s `set()` now records
  `lastPublishedValue[topic]`/`lastPublishedAt[topic]` on every real
  publish, and the `'message'` handler suppresses (skips updating
  `receiving`/emitting `'change'` entirely for) an incoming message
  whose value matches what THIS model just published to that SAME topic
  within the last 5 seconds. MQTT 3.1.1 has no protocol-level way to
  tell a broker "don't deliver my own publishes back to me" (that's an
  MQTT5-only subscribe option), so this is the standard client-side
  workaround. No-op in the common case (CloudOut-only topics, nothing
  subscribed) - only activates when something IS subscribed to a topic
  this same connection also publishes to.
- **"Settle" publish added**: after averaging, once a full `sendInterval`
  passes with NO new samples arriving (`pendingCount` stays 0), publish
  the exact CURRENT value once more - not an average. Averaging over an
  active window can land on a mean that doesn't exactly match where the
  input actually came to rest (it may have stopped moving partway
  through a window), and with nothing further changing, no future
  set() call would ever correct that. New `scheduleSettleCheck(field)`
  on `CloudModel.js`, called after every real publish (both the
  immediate and trailing-edge paths); a settle timer that fires to find
  new samples already pending just no-ops (the normal throttle path
  already has it handled, and will schedule its own settle check
  afterward). Explicit request 2026-09-24, after the user clarified
  they wanted averaging KEPT (not reverted, as an earlier message
  suggested) plus this refinement on top. `close()` now also clears
  both `pendingSendTimeouts` and `settleTimeouts` or a stale timer
  could fire after the connection's gone; `publishNow` guards on
  `self.client` for the same reason.
- **CloudOut flashes when a publish actually happens, rather than
  permanently switching the display to the published value.** First
  attempt bound the second numeric display directly to the last
  published value (new `'published'` event on `CloudModel.js`, emitted
  right after the real `client.publish()` call, relayed through the
  same generic path as `'status'` - `bindModelToTransport` ->
  `server:hardwarePublished` -> `SocketAdapter.js` -> `hardwarePublished`
  vent) - but the user pushed back: "the avg shouldn't be the final
  outcome" - the display going stale at the last published (possibly
  averaged) value, no longer tracking the live dial, wasn't what they
  wanted. **Revised**: the display stays bound to `out` (always the
  live current value) at all times; `onHardwarePublished` now just
  flashes `.outvalue`'s color briefly (300ms, green) when a publish
  fires, matching the OLD CloudOut's exact send-confirmation convention
  (flash on send, revert after). The `'published'` event/relay chain is
  still real and used - just for a flash trigger, not a value override.
  **Refined twice more, settled on the final design**: color-only flash
  wasn't enough (user wanted to SEE the real number, not just infer
  "something happened" from a color change on an unrelated live
  number) - tried a temporary override that reverted to the live dial
  after 700ms, but that wasn't right either: "what I actually want is
  that the second numeric output show the just sent value and stay
  there until the next send... shows the average all the time at each
  interval and when settle happens shows that value." **Final design**:
  new `displayOut` model field, bound in the template instead of `out`.
  It is set ONLY by `onHardwarePublished` (to the real published/
  averaged/settled value) and does NOT track the live dial at all - no
  mirroring, no revert-after-timeout. It holds whatever was last
  actually sent, indefinitely, until the next real send updates it
  again. A brief 300ms color flash still marks the moment a publish
  happens, but the persistent part is the number itself. The settle
  publish (previous entry) emits the same `'published'` event, so it
  updates `displayOut` for free too, no extra wiring - matches "when
  settle happens shows that value" exactly.
- **"More" panel layout cleanup.** Both templates mixed
  `class="narrowLabel"` (30px) for host/port with unstyled default
  labels (60px) for everything else, so inputs didn't line up in a
  column - looked messy. Standardized both templates to plain `<label>`
  throughout (the existing default 60px rule), shortened a couple of
  labels that wouldn't have fit (`sendInterval` -> "min ms",
  `averageInputs` -> "avg", `username`/`password` -> "user"/"pass") -
  matches the brevity every other widget's "more" panel already uses.
  Also dropped the unused `class="keys"` (never had a matching CSS rule
  - a harmless leftover from the old widget).
- **CloudIn/CloudOut on separate topics, confirmed fully working
  end-to-end 2026-09-24**: user created a second Adafruit IO feed
  (`test`), pointed CloudIn at it, changed the value directly from
  Adafruit's own dashboard, and saw it land on CloudIn in real time.
  With separate topics there's no self-echo ambiguity at all - this is
  the clean, confirmed-good way to round-trip test (or run) CloudIn/
  CloudOut together, as opposed to sharing one topic, which the
  self-echo suppression fix (above) makes fundamentally unable to
  deliver anything to CloudIn (every message IS indistinguishable from
  the echo of CloudOut's own publish when they share a topic - not a
  bug, an inherent limit of one MQTT 3.1.1 connection both publishing
  and subscribing to the same topic). **Worth a doc note**: recommend
  separate topics for CloudIn/CloudOut in the same patch as the default
  guidance, not just for testing.

**Open items, not yet done:**
- **No graceful shutdown for Cloud connections.** `electronApp.js` has
  an `app.on('will-quit', ...)` hook for the Speech helpers
  (`stt.quitAll()`/`tts.quitAll()`) but nothing closes live MQTT
  connections on app quit - they just get cut when the process dies.
  Harmless for a well-behaved quit (TCP just drops), but means a killed/
  crashed process can leave a broker-side session alive until ITS OWN
  keepalive timeout expires, which briefly could contend with a fresh
  reconnect under the same account. `netlabServer.js`'s Promise-based
  factory doesn't currently expose `clientSync`/`deviceControllers` back
  to `electronApp.js` at all, so wiring this up means changing what that
  Promise resolves with, not just adding a listener. Not done tonight -
  real fix, not just a debugging-session inconvenience, but deferred
  since the actual bug turned out to be the Adafruit IO topic format,
  not this.
- **CloudOut had no publish rate limit at all** (event-driven, published
  on every actual `out` value change with zero throttling) - fine for a
  self-hosted/unlimited broker, but a real problem for rate-limited
  services like Adafruit IO's free tier (30 points/minute, the same
  constraint the OLD Adafruit-only CloudOut had explicit `sendPeriod`
  logic for). **Fixed same session**: added a `sendInterval` field
  (ms, default `0` = uncapped) with trailing-edge throttling in
  CloudOut.js (`throttledSync`/`doSync`) - a value changing inside the
  throttle window schedules one deferred send for when the window
  closes, so the last real value always eventually goes out rather than
  being silently dropped. CloudIn has no equivalent field - it's
  push-based on the SUBSCRIBE side, driven entirely by whatever rate the
  broker/publisher sends at, nothing NTK controls to throttle.

## Current state

CloudIn/CloudOut already exist (`app/scripts/views/CloudIn`,
`CloudOut`) but are narrow and app-side only:

- Hardcoded to one service: Adafruit IO's REST API
  (`https://io.adafruit.com/api/v2/<user>/feeds/<feed>/data`), via
  `$.ajax` GET/POST from the browser/renderer. Fields are
  `aioUsername`/`aioKey`/`aioFeedKey`.
- Poll-based, not push: CloudIn GETs on a timer (`getPeriod`, default
  10s) and shows a countdown; CloudOut POSTs on a timer/on-change
  (`sendPeriod`). No persistent connection.
- Client-side only — driven by `window.app.timingController`'s 60fps
  frame callback in the browser/Electron renderer. No server-side or
  device-side component, so it only works while NTK's own app is open
  and connected, and can't run standalone on a deployed device.
  `docs/cloudout.md` notes earlier versions also supported
  data.sparkfun.com (Phant) and particle.io and thingspeak.com — all
  three were removed, leaving Adafruit-IO-only.
- Still reference the legacy `app.server`/`app.serverMode` multi-client
  flags (dead-but-harmless since the Edit ON/OFF button removal, see
  `socketio-removal.md`).

## Goal

Replace the Adafruit-IO-specific REST polling with generic, host-agnostic
MQTT — works with Adafruit IO (which also exposes an MQTT broker),
AWS IoT, HiveMQ, self-hosted Mosquitto, etc. — and make it run standalone
on the device, same as OSCIn/OSCOut, so a deployed board can publish
sensor data / subscribe to commands with no computer involved. This is
what makes NTK a genuine IoT device authoring tool rather than a
prototyping-only tool that stops working the moment you unplug the
laptop.

## Design

### Fields (replaces aioUsername/aioKey/aioFeedKey)

- `host`, `port` (default `1883`), `tls` (bool, **default false**)
- `username`, `password` (blank if the broker allows anonymous)
- `topic` — for CloudOut, what it publishes to; for CloudIn, what it
  subscribes to

**TLS is opt-in, not the default — corrected 2026-09-23.** Originally
scoped as default-on ("most brokers require it"), which was wrong on
checking: self-hosted brokers (Mosquitto etc.) are plaintext by default,
and Adafruit IO itself offers plain MQTT on 1883 alongside TLS on 8883.
The real outliers that mandate TLS are AWS IoT Core (client-cert mutual
TLS, no plaintext option at all) and HiveMQ Cloud's hosted tier — a
minority of the brokers this widget will actually point at, not the
common "talk to my own broker on the LAN" case NTK is mostly aimed at.
Defaulting TLS off keeps the common-case standalone memory cost close to
what OSC already costs (a persistent socket + Python bookkeeping, no
mbedTLS handshake/record buffers) — the TLS memory spike below still
matters for users who do need it, just isn't the default path everyone
pays for.

**Adafruit IO migration note for docs:** `host = io.adafruit.com`,
`port = 1883` (or `8883` + `tls = true`), `username = <AIO username>`,
`password = <AIO key>`, `topic = <username>/feeds/<feedkey>`. Existing
patches using the old fields will need re-entering once — acceptable,
per `plans/README.md`'s standing policy (no other users, dev branch,
default to simplification over back-compat).

### App-side connection: server process, not the browser

Put the actual MQTT client in the Node server process (the `mqtt` npm
package) rather than the browser/renderer. A browser MQTT client is
limited to brokers that expose MQTT-over-WebSocket; a Node client gets
raw TCP+TLS to any broker. This plugs into the existing socket.io relay
the same way a hardware widget's server-side model does today
(`nlMultiClientSync.js`) — doesn't collide with the deferred
`socketio-removal.md` work, just uses the pattern already there. If/when
that removal happens, this migrates along with every other hardware
model, not specially.

One MQTT client connection per distinct `(host, port, username)` — not
one per widget — same grouping idea `standalone_interpreter.py`'s
`_claim_osc()` already uses for OSCIn (grouped by port) and OSCOut
(grouped by host+port). Multiple CloudIn/CloudOut widgets pointed at the
same broker share one connection and just add subscriptions/publishes on
it.

### Push-based UI, not poll/countdown

MQTT is a persistent pub/sub connection: CloudIn should update the
instant a message arrives (no `getPeriod` timer or countdown display),
CloudOut publishes immediately on change (optionally still rate-limited
like today's "only send when changed" logic, since brokers can also
rate-limit). Replace the countdown text with a connected/disconnected
indicator — fits the CLAUDE.md widget principle (interface should show
what's happening, not poll silently) better than the current design
does. Keep the in-widget dial for offline testing (CloudOut's `in` dial,
CloudIn's `out` dial) — lets someone build and verify the logic side of
a patch with no broker reachable yet, same as every other widget.

### Standalone (on-device) support

Mirrors the OSCIn/OSCOut build (`standalone-patch-export.md`,
2026-09-23):

- Vendor `adafruit_minimqtt` (+ its `adafruit_ticks` dependency) into
  `firmware/xiao-esp32c6-circuitpython-firmata/lib/`.
- `standalone_interpreter.py`: add `CloudIn`/`CloudOut` to
  `PORTABLE_TYPE_IDS`/`CHAIN_TYPES`, new `cloud_in`/`cloud_out` step
  kinds in `_build_steps()`, a `_claim_cloud()`/`_release_cloud()` pair
  grouping widgets by `(host, port, username)` into shared
  `MQTT.MQTT` client instances, `tick()` polling each client
  (`.loop()`) and dispatching subscribed-topic updates into
  `CloudIn` widgets' `in` field, publishing `CloudOut` widgets' `out` on
  change. **`adafruit_minimqtt` itself must only be imported inside
  `_claim_cloud()`, and only if the patch actually has a CloudIn/CloudOut
  step** — same shape `_claim_osc()` already uses for `microosc` (import
  + client construction only happen for patches that actually contain
  OSCIn/OSCOut). A patch with no cloud widgets should pay nothing for
  MQTT support existing in the firmware, same as it pays nothing for OSC
  today. This is the opposite of Grove's unconditional module-level
  import + I2C probe on every boot regardless of use — don't repeat that
  pattern here.
- `app/scripts/utils/StandaloneCompatibility.js`: add `CloudIn`/
  `CloudOut` to `PORTABLE_TYPE_IDS`.
- TLS is the real open risk here, not present in the OSC build at all:
  CircuitPython's `ssl` module + certificate handling has its own memory
  cost (mbedTLS handshake/record buffers), needed for AWS IoT Core /
  HiveMQ Cloud but not for a plaintext local broker or Adafruit IO's own
  plain port. **Must be implemented lazily** — `_claim_cloud()` should
  only import `ssl` / wrap a socket in TLS for the specific
  `(host, port, username)` groups that actually have a widget with
  `tls: true` in that patch, not unconditionally for every patch. Done
  right, a plaintext-only patch pays nothing for TLS existing as an
  option elsewhere in the code — same lazy-import principle discussed
  for the Grove drivers' unconditional-import cost. Validate the TLS
  path's actual cost early with a real hardware spike (single CloudOut,
  TLS on, watch `'m'`) before assuming the rest of the design is
  memory-safe — don't discover this the way the push-transport memory
  ceiling got discovered (2026-09-23, `standalone-patch-export.md`),
  mid-build on a bigger patch.
- Every standalone network client added so far (Firmata, OSC, now MQTT)
  keeps its own persistent connection alive. Worth a real soak test
  once this exists — tonight's kitchen-sink baseline
  (107,440 bytes free steady-state with OSC×2 + all logic widgets
  running) was reassuring but was a single idle snapshot, not a
  multi-hour run under live traffic on all three network paths at once.

## Build order

1. Rewrite the app-side widgets to generic MQTT via the server-side Node
   client — this alone fixes the current Adafruit-IO-lock-in and
   poll-based design, independent of standalone work.
2. Extend the standalone interpreter (vendored library, step kind,
   claim/release, TLS spike first).
3. Update `docs/cloudin.md`/`docs/cloudout.md` (migration note +
   generic-broker instructions) and `standalone-patch-export.md`'s
   widget list (move CloudIn/CloudOut out of "gray area, deferred").
