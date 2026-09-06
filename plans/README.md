# NTK plans

Design docs for planned / exploratory work. Nothing here is started
unless a doc says otherwise. Most of these came out of architectural
exploration in September 2026 and are scoped via discussion, not code.

## Project context

NTK currently has no users other than Phil. It was built 2014–2017 with a
hired developer (Scott Cazan, the original architect), and development
stalled in 2017 when funding ran out. There is no installed base, no
other deployments, and nothing depending on backward compatibility with
the 2014–2017 architecture. `npm start` / headless server mode and
remote / multi-client access are not used by anyone in practice — it's
just Phil using the Electron app.

**Why this matters:** there is total freedom to make architectural
changes without weighing "will this break an existing user's setup." When
weighing an architecture simplification (cutting legacy protocol /
dependency weight, removing infrastructure built for use cases nobody
exercises) against preserving flexibility for hypothetical future users,
default toward simplification. This isn't a license to break things
carelessly, but backward compatibility with the 2014–2017 architecture is
not itself a reason to preserve anything.

**The mission:** give designers and other non-technical people a quick,
easy way to prototype tangible / IoT projects — drag-and-drop widgets, no
code for the common case, hardware optional (most widgets should be
testable by interacting with the widget itself before any hardware is
connected — see the Widget design principles in `CLAUDE.md`). The AI
widgets (Gesture, PoseTrack, FaceTrack, and the planned
[LLM widget](llm-widget.md)) extend that same mission to AI-assisted
interaction design.

## The architecture threads

Broad architectural exploration, not a single feature. These are all
connected; the loopback-server change (below) is the pivot point.

1. **[iPadOS port](ipados-port.md)** — port NTK to iPadOS as a WKWebView
   shell + a thin Swift / `Network.framework` bridge standing in for
   Node's `net`, reusing almost all existing JS unchanged. Dropping USB
   serial removes the one hard blocker.
2. **[Standalone patch export](standalone-patch-export.md)** — the remote
   device runs its own patch with no host, via a generic on-device
   interpreter reading the same JSON patch format NTK already saves.
   Includes an NTK-push deploy channel, reconnect-as-monitor feedback,
   and a folded-in Firmata → native-protocol replacement.
3. **[socket.io removal](socketio-removal.md)** — `server/`'s
   `socket.io: "~1.0.0"` is the root cause of most of the repo's
   Dependabot alerts. The plan is to remove it (and Express /
   `nlMultiClientSync.js` / `npm start`) outright, replaced by Electron
   IPC — not upgrade it to v4.
4. **[Macro widget](macro-widget.md)** — consolidate a group of
   connected widgets into one reusable widget (a subpatch / abstraction).
   The oldest of these ideas; hinges on the same wiring internals as the
   rest. Needs [multi-select](multi-select.md) as a prerequisite.
5. **[Multi-select](multi-select.md)** — rubber-band + shift-click
   selection on the canvas, group drag / delete. No selection mechanism
   of any kind exists today. Prerequisite for Macro, independently useful.
6. **[Infinite canvas](infinite-canvas.md)** — scrollable (later
   zoomable) patch canvas. Panning is scoped in detail; zoom is noted
   separately as the harder half.
7. **[Device discovery](device-discovery.md)** — connect NTK to the WiFi
   CircuitPython board without reading the DHCP IP off a serial console.
   SoftAP mode is built and hardware-tested; mDNS is the planned default.

## The pivot point: the loopback-server change

The Electron app's own UI talks to its own hardware backend over an
HTTP + socket.io round-trip today — `SocketAdapter.js` hardcodes
`127.0.0.1:9001` — even fully local with nothing remote involved. The
server plays two separate roles that are easy to conflate:

- **Role A — internal loopback:** the renderer's own UI reaching its own
  hardware-driving backend over `127.0.0.1:9001`. Not about remote access
  at all; just how the app is built internally.
- **Role B — genuine remote / multi-client access:** `nlWebServer.js`'s
  `server.listen()` binds all interfaces (LAN-reachable), which is what
  served "view this patch from another device" / "run NTK from an iPad" /
  `npm start` headless-Pi deployments.

**Replacing Role A with real Electron IPC** — extending the
`contextBridge` pattern `server/preload.js` already uses for the Video /
Audio / Image file picker — is the single most leveraged change of
everything here:

- It makes Macro's socket.io wiring concern disappear *by elimination*
  rather than by upgrade-and-retest.
- It resolves the socket.io CVE question *by removing the dependency*
  rather than migrating it.
- It's independent of whether the iPad port or standalone-device work
  ever happens.

**Easy to get wrong:** the payoff comes from replacing Role A
specifically. Removing only Role B (e.g. binding the server to loopback)
leaves socket.io fully in place internally and gets neither payoff. Role
A and Role B are independent decisions.

**Resolved (2026-09-03):** with no current users and nobody exercising
Role B, this stops being a tradeoff to weigh. The plan is to replace Role
A with Electron IPC *and* drop Role B outright — Express, socket.io,
`nlMultiClientSync.js`, and `npm start` all removed, not kept as opt-in.

### Historical grounding — why the loopback pattern exists

It isn't an oversight. Git history: the first commit (2014-07-03, in a
repo then named `netlabtoolkit/widgets-html5`) is a pure browser-based
client/server web app — no Electron. Raspberry Pi was an explicit target
within a month (README commit 2014-08-09). Electron wasn't added until
2015-11-27, over a year later, as just one more client pointed at the
same existing server — not a redesign. A 2014 Pi (single-core ARM11
@700 MHz, 512 MB) genuinely could not run a Chromium GUI but could run a
headless Node server relaying serial data. "One universal client, works
local or remote" was a deliberate, well-suited design for the hardware of
the time. Replacing Role A trades away that one-client-works-everywhere
property — a real, conscious tradeoff, not a correction of an oversight.

## Proposed build order

Set by Phil on 2026-09-03.

1. **Remove the loopback server system** — drop Role A (and Role B).
   Express / socket.io / `nlMultiClientSync.js` / `npm start` all
   removed, not just socket.io in isolation.
2. **Implement new wiring infrastructure** — the Electron-IPC-based
   replacement for how widget model / mapping data crosses the
   main↔renderer boundary now that socket.io is gone. This is the
   necessary rebuild that step 1 creates a need for, not optional
   follow-up.
   - Design detail to resolve here: if Express's static-file-serving role
     goes too, the renderer needs another way to load its own HTML / JS /
     templates. NTK loads templates via RequireJS's `text!` plugin
     (`text!./template.js`), which uses XHR, and `file://`-protocol XHR
     has its own Chromium restrictions. Options: Electron's `loadFile()`,
     or a minimal static server kept just for assets.
3. **[Multi-select](multi-select.md)** — promoted to its own explicit
   step. Hard prerequisite for step 4: Macro needs a selection mechanism
   to know what to consolidate, and none exists today.
4. **[Macro system](macro-widget.md) + [infinite-canvas](infinite-canvas.md)
   scrolling** — combined into one step, built on step 3's selection.
5. **[Standalone patch export](standalone-patch-export.md)**, including
   its folded-in Firmata → native-protocol replacement and the
   reconnect-as-monitor feedback design.
6. **Possible elimination of serial and network Firmata support** —
   broader than the Firmata replacement folded into step 5 (which only
   scoped the WiFi CircuitPython firmware). This also covers dropping
   USB / Arduino serial support (`ArduinoModel.js`, `@serialport/bindings`)
   entirely. Marked "possible" — not yet a firm commitment.
7. **[Build an iPadOS version](ipados-port.md)** — sequenced last. If step
   6 happens first, the iPadOS native bridge should target whatever new
   native protocol comes out of step 5/6 rather than Firmata. Also the
   natural fold-in point for the Bower migration (see below), since the
   iPadOS port needs a from-scratch build pipeline anyway.

### Pacing note

Steps 1+2 are a full rebuild of the core wiring mechanism everything else
depends on. Steps 1, 2, 3, and 6 are enabling / plumbing work with no
user-visible payoff on their own — there's a real stretch of
foundation-rebuilding before anything new is visible. The genuine
new user-facing capability is concentrated in Macro / infinite-canvas
(4), standalone export (5), and the iPadOS port (7). Don't rush 1→2→3→4
back to back without confidence the new foundation is solid.

### Benefits assessment (2026-09-03)

Reaction to four claimed benefits of the overall strategy:

1. **"Eliminate library security vulnerabilities"** — true for the
   app-level dependency tree (socket.io v1's transitive tree —
   ws / engine.io / xmlhttprequest / debug / parsejson / parseuri — was
   the source of most of the ~78 Dependabot alerts; step 6 removes
   `@serialport/bindings` / `firmata-io` / `johnny-five` too).
   **Overclaims for the whole app:** Electron bundles its own
   Chromium / V8 / Node, typically an Electron app's single largest CVE
   surface — untouched by steps 1–6. Only step 7 (WKWebView, using the
   OS's own auto-patched WebKit) escapes that. Bower is a second,
   separate library-vulnerability surface this plan doesn't touch.
2. **"Simplify architecture and maintenance"** — agreed, strongly (one
   hardware-model implementation instead of two, no cross-process sync).
   Caveat: steps 2, 5, and 7 each replace an old system with a real new
   one — this is "replace a tangled legacy design with a cleaner one,"
   not pure subtraction.
3. **"Smaller .app"** — real but lopsided. Desktop: Electron's ~150–250 MB
   Chromium / Node baseline dominates and isn't touched by steps 1–6.
   iPadOS (step 7): dramatic, since WKWebView bundles no browser engine.
   Separately, the MediaPipe WASM / model assets for PoseTrack / FaceTrack
   are a non-trivial size cost none of these steps address.
4. **"Real functional improvements"** — true, but concentrated in steps
   4, 5, and 7 (genuine new user-facing capability). Steps 1, 2, 3, 6 are
   plumbing.

## Known technical debt (not started)

- **Bower needs replacing.** `buildScripts/setup.sh` runs `bower install`;
  Bower has been unmaintained for years. The RequireJS / AMD module
  system expects dependencies at fixed `bower_components/` paths (the
  `paths:` config in `app/scripts/main.js`), so replacing it means
  migrating those packages to npm and repointing `main.js`'s paths — a
  few Bower-only packages (e.g. the jQuery UI touch-punch fork) may need
  an npm equivalent or direct vendoring. Its own scoped project; the
  iPadOS port (step 7) is the natural fold-in point.
- **Dependabot alerts** on the GitHub repo — mostly the socket.io tree
  (resolved by step 1) plus Bower's pinned jQuery / jQuery UI versions
  (untouched by any step). `https://github.com/netlabtoolkit/ntk/security/dependabot`.
- Steps 3–4 (multi-select, Macro, infinite-canvas) likely *deepen*
  reliance on Bower-managed libraries (jQuery UI draggable,
  `bower_components/cable-manager/CableManager.js`), since that's exactly
  the code a canvas / selection feature extends.

## Done

The Apple Silicon modernization (2026-08, based on upstream `dev`, not
`master`; dropped Edison / Galileo / PhantomJS / Thingspeak) is complete
and shipped. Its historical step-by-step plan is at
`~/.claude/plans/glittery-drifting-plum.md` (outside the repo).

## Other planned widgets

- **[LLM widget](llm-widget.md)** — text prompt → LLM → text response,
  provider (Anthropic / OpenAI / Ollama / OpenAI-compatible) and model
  picked in the "more" panel.
