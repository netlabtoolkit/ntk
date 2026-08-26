# NTK (NetLab Toolkit) - notes for Claude

## Widget design principles

- All widgets' main bodies are the same fixed size (94x110px, see the
  "Widget CSS layout" section below). Keep the most-used controls in the
  main body; put configuration/tuning controls in the "more" panel
  (`.widgetBottom .content`, toggled by the "more" tab) instead of trying
  to widen or grow the main body to fit everything.
- The interface should actively inform the user what's happening, not
  just accept input silently - e.g. Gesture's recognition meter/percent
  readout while capturing, IfThen's blink during a pending wait state,
  a record button's flashing while actively recording. If a state change
  isn't visible, users read it as broken even when it's working correctly.
- As much as possible, the user should be able to test a widget without
  any hardware connected. Where practical, let them simulate the hardware
  by interacting with the widget directly, not just by wiring another
  widget's output into it - e.g. Knob/AnalogOut's in-widget dial,
  Gesture's dial for recording/testing without physical hardware
  attached, SpeechOut's speak button. This lets someone build and verify
  a patch's logic entirely before any hardware is connected.

## Build & run

- `npm run build` compiles SCSS and bundles/checks JS. It's normal for this
  to print many `toTransport skipping ... Unexpected token <` lines for
  every `*/template.js` file (they're HTML, not JS - a doc-comment scanner
  chokes on them) and Sass `@import` deprecation warnings. Neither is a
  real error; only treat it as broken if `SCSS files built` is missing or
  there's an actual JS syntax error in a file you touched.
- **`npm run build` overwrites `server/currentPatch.ntk` with the empty
  patch template every time it runs** (`cp ./server/emptyPatch.ntk
  ./server/currentPatch.ntk`, part of the `build` npm script), and
  `npm run electron` (dev mode) reads/writes that exact file - not the
  packaged app's `userData` path (see `getPatchPath()` in
  `nlMultiClientSync.js`, which branches on whether `__dirname` matches
  the raw source tree). If the user has a patch open and asks for a
  code change, rebuilding for that fix silently destroys their current
  patch on next launch. Back up `server/currentPatch.ntk` (or copy it
  from Electron's userData `currentPatch.ntk`, if a packaged run saved
  one more recently) before rebuilding if there's any real patch in it,
  and restore it after.
- Run the app with `npm run electron > /tmp/some.log 2>&1 & disown`, then
  grep the log for `error`/`exception`. The Express server logs every GET
  request (including 404s), so a widget's `.js`/`template.js` failing to
  load is visible directly in that log without opening DevTools.
- **View > Toggle Developer Tools** (`Cmd+Option+I`) is wired up in the
  app menu (`server/electronApp.js`) - use it to read the real console/
  inspector instead of the `fetch('/DEBUG?...')`-to-server-log relay trick.

## Rivets/Backbone widget gotchas

- Custom `rivets.binders.*`/`rivets.formatters.*` used by a widget's own
  template **must be registered before** calling
  `WidgetView.prototype.onRender.call(this)`. That base call is what
  performs rivets' actual bind pass, resolving each `rv-*` binder at that
  moment - registering after it means the binding is silently never wired
  up (plain `rv-text` bindings still work since those are framework
  builtins, but a custom binder's routine is just never invoked).
- Prefer declarative `rv-class-<name>="widget:someBooleanField"` bindings
  for state-driven UI (colors, active/pending states) over imperative
  `this.$(...).css(...)` calls driven from a manual `onModelChange`
  listener. The declarative form is far easier to verify and doesn't
  depend on getting listener/event ordering right.
- `<input>` values bound via `rv-value` are always strings. `+` on a
  string silently does concatenation, not addition (e.g.
  `Date.now() + model.get('someMsField')` produces a garbage timestamp if
  that field came from a text input). `parseInt`/`parseFloat` at the
  point of arithmetic use.
- A widget's own `initialize()` calling `this.model.set(defaults)`
  fires `onModelChange` synchronously (bound by the base class's
  `initialize`, which already ran). Any internal instance state that
  `onModelChange`/its callees reference must be initialized *before* that
  `.set(defaults)` call, or it throws on construction.

## Widget CSS layout

- Every widget's `.widgetBody` gets a hardcoded 94x110px box by default
  (`app/styles/Widget.scss`), with `.widgetBodyLeft`/`.widgetBodyRight`
  floated left/right inside it.
- **Don't widen `.widgetBody`'s own declared width** to fit extra content
  - that pushes `.widgetRight` (the outlet nub column) further right,
    since sibling layout depends on the declared box width, not the
    visually-overflowed content. IfThen/Splitter's wider `.outletValue`
    (64px, see the global rule in `Widget.scss`) is allowed to overflow
    its narrower floated column instead; follow that pattern rather than
    growing `.widgetBody`.
- If a widget's content is taller than 110px, `.widgetBody { height:
  auto; min-height: 110px; }` needs its own clearfix
  (`&:after { content:''; display:table; clear:both; }`) - `height:auto`
  alone does not make a container account for floated children's height.

## Packaged app specifics

- `getPatchPath()`-style save paths must resolve via
  `require('electron').app.getPath('userData')` when running packaged
  (detect via `process.versions.electron`) - a path relative to the app
  bundle resolves inside the read-only `app.asar` archive and silently
  fails to save.
- `npm run package` (`buildScripts/packageElectron.js`) signs and
  notarizes the macOS build with the "Developer ID Application: Commotion
  New Media, Inc (2E2K9GSX37)" identity, using
  `buildScripts/entitlements.mac.plist` (needed for hardened runtime plus
  loading `@serialport/bindings`' unsigned native `.node` binary) and
  notarization credentials stored under the `NTK-notarize` keychain
  profile (`xcrun notarytool store-credentials NTK-notarize ...` - see
  the comment block at the top of that script). Both steps degrade
  gracefully (warn + skip) if the identity/profile aren't present on the
  machine, so it's still safe to run on a machine that only needs an
  unsigned dev build; `--no-sign`/`--no-notarize` force that.
- **`@electron/osx-sign`'s top-level `osxSign.entitlements` and
  `osxSign.hardenedRuntime` options are silently ignored** - its per-file
  codesign pass (`sign.js`) only reads whatever `osxSign.optionsForFile()`
  returns, falling back to Electron's stock default entitlements
  otherwise. Verified by inspecting the signed app with `codesign -d
  --entitlements :-`: the plain top-level fields produced an app signed
  with the *default* entitlements plist, with the custom one silently
  dropped. Entitlements customization must go through
  `osxSign.optionsForFile: () => ({ entitlements: ..., hardenedRuntime:
  true })` instead.
