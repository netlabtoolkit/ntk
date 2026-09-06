# Macro widget

**Status:** design spec. Not started. Build-order step 4 (after
[multi-select](multi-select.md) and the wiring rebuild).

Let the user select a group of connected widgets on the canvas and
consolidate them into a single new widget — a subpatch / abstraction in
Max/MSP or Pure Data terms. So complex patches can be organized and
reused as single units rather than staying fully flat / exploded.

This spec is grounded in the actual code (`app/scripts/controllers/Patcher.js`,
`PatchLoader.js`, `views/item/WidgetMulti.js`), not guesses.

## Key finding that makes this tractable

Every widget's `ins` / `outs` are copied onto its **model instance** at
construction (`WidgetMulti.js`'s `initialize()`:
`_.extend(options, {ins: this.ins}); _.extend(options, {outs: this.outs});`),
and every widget's inlet / outlet markup binds to `widget:ins` /
`widget:outs` (the model's own copy) via `rv-each-inlet` /
`rv-each-outlet` in `template.js` — not a hardcoded class-level constant.

So a Macro widget **can** have a different number of inlets / outlets per
instance depending on what that specific macro exposes, and the existing
drag-to-connect cable UI should work on it without new plumbing. This was
the biggest open question and it's already supported.

## What has to be built

1. **[Multi-select on the canvas](multi-select.md)** — confirmed via
   search that this doesn't exist at all (no `rubberband` / `multiselect`
   / `shiftKey` / `selectedWidgets` anywhere in `app/scripts`). A real
   prerequisite, broken out into its own spec.
2. **"Consolidate into Macro" action** — given a selection, capture the
   selected widgets' full state + the cables *between* them. This is the
   same `{widgets, mappings}` JSON shape whole patches already use
   (`Patcher.js`'s `savePatch` / `PatchLoader.js`'s `loadJSON`) — no new
   serialization format, just applied to a subset. Then a review step:
   pick which internal ports (things connected to something *outside* the
   selection, or left dangling) get "promoted" to the macro's own
   external inlets / outlets, with labels.
3. **A new generic `Macro` widget type** whose model stores the captured
   `{widgets, mappings}` blob plus the port-promotion map as plain model
   attributes — same pattern as Gesture's per-slot recorded templates, so
   it round-trips through save / load for free. At construction it
   reconstructs its internal widget graph using the same
   `addFunction` / `mapFunction` machinery `PatchLoader.loadJSON` already
   uses for top-level patches (`views/composite/Widgets.js` collection +
   `Patcher.Controller`'s `onExternalAddWidget` / `mapToModel`) —
   recursively, scoped inside one widget instance instead of the whole
   canvas.

   Setting one of the macro's own `in<n>` model attributes needs to
   propagate to the right internal widget's field, and internal widget
   output changes need to propagate back out to the macro's own `out<n>`
   attributes. **This nested signal-chain wiring is the single biggest
   unknown** in the whole feature — everything else has a direct,
   already-working precedent elsewhere; this doesn't.
4. **A way to look inside an existing macro** — some overlay or zoomed
   sub-canvas showing the internal widgets. Real UI surface, not free
   (every widget's UI is self-contained within its own small fixed body,
   per `CLAUDE.md`'s widget design principles).

## Scope: v1 vs v2

**v1 (recommended first cut):** each macro *instance* independently
carries its own internal patch — create one from a selection (like
Gesture's per-instance recorded gestures, not a shared definition). No
reusable macro *type* you can stamp out multiple copies of yet. To
"duplicate" a macro, copy its own saved model data like any widget's
config.

**v2 (bigger, later):** a true reusable component — drop multiple
instances of "the same" macro, edit one definition and have it propagate
to all instances (or explicitly not, like Pd abstractions vs. Max
bpatchers — a real design choice itself). This resembles a user-authored
widget *type*, closer in scope to "Creating a New Widget" than to a
normal widget feature. A wholly separate future project, not a v1.1.

## The distinct wiring systems this touches

Traced through the actual code when scoping how deep the cable-rewiring
work goes. Five separate systems, in priority order for Macro:

1. **`Patcher.js`'s `mapToModel` / `removeMapping` / `widgetMappings` —
   the real wiring graph.** A flat array of `{viewWID, modelWID, map:
   {sourceField, destinationField}, offsets}`. The actual API surface
   Macro's "promote to external port" step has to call into: reading
   which of a selection's mappings cross the group boundary vs. stay
   internal, then rewriting the boundary ones to point at the macro's own
   inlets / outlets.
2. **`CableManager` (`bower_components/cable-manager`) — purely visual.**
   Draws / drags / removes on-screen cables via
   `window.app.cableManager.createConnection(...)` (called from
   `mapToModel`). Doesn't carry data. Macro needs this to hide internal
   cables (collapsed inside the box) and redraw external ones at the
   boundary.
3. **Direct Backbone model listeners (`view.addInputMap`, in
   `WidgetMulti.js`) — same-tab value propagation**, no socket.io. This
   is where each connection's `SignalChainFunctions` /
   `SignalChainClasses` (scale, invert, smoothing, `limitRange`) actually
   run. **This is "the single biggest unknown" concretely:** when a
   boundary cable gets rewired into / out of the macro, whatever
   per-connection transform was configured on the original mapping has to
   survive the rewrite rather than silently reset to defaults.
4. **socket.io (`SocketAdapter.js` / `nlMultiClientSync.js`) —
   cross-process sync only.** Re-broadcasts the same mapping / model
   changes from #1 / #3 to a second connected client or a driving
   hardware server. **Going away entirely** — see
   [socketio-removal.md](socketio-removal.md). Once the loopback server
   is replaced with Electron IPC, there's only ever one process, so
   there's no cross-process mapping sync to get right at all. Macro's
   build order can assume #4 simply doesn't exist.
5. **Hardware model mapping** (`ArduinoModel.js` / `NetworkModel.js`,
   `modelType:server`-style `modelWID` strings — the `else` branch in
   `mapToModel` when a widget maps directly to a pin). Edge case worth
   explicitly testing: if a macro contains a widget wired directly to
   hardware, that hardware mapping needs to be preserved / exposed
   correctly too.

**Recommended reading order when build starts:** #1 and #3 first (the
real rewrite logic and where settings could silently get lost), #2 as the
necessary visual follow-through, #5 as an explicit test case. #4 is gone
by the time this starts.
