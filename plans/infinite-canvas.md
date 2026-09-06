# Infinite canvas

**Status:** panning scoped in detail; not started. Zoom noted separately
as the harder half. Combined with [Macro](macro-widget.md) into
build-order step 4.

Make the patch canvas (`#patcherRegion`) scrollable (and later zoomable),
so complex patches — especially once macros exist — can outgrow the
current fixed viewport-sized canvas. Panning comes before macros in build
order.

## Panning scope

**The core issue:** `#patcherRegion` (`app/styles/patcher.scss`) is
currently just `width: 100%; height: 100%`, with no `position` and no
`overflow` set — and neither is `body` / `html`. Since widgets are
`position: absolute` (set at runtime in `WidgetMulti.js`), they're
actually positioned relative to the *viewport* right now, not to
`#patcherRegion` itself, purely because nothing in the ancestor chain
establishes a positioned container. That's what has to change.

**What needs to happen:**

1. **Establish a real canvas container** — give `#patcherRegion` (or a
   new inner wrapper) `position: relative` so it becomes the actual
   containing block for widgets, plus `overflow: auto` to make it
   scrollable.
2. **Give it room to scroll into** — an inner element sized larger than
   the viewport. MVP: a generously large fixed size (a few thousand px
   each direction); growing it dynamically based on the furthest-placed
   widget is a nicer v2 refinement, not required for v1.
3. **Move the cable-drawing SVG** — the one real structural fix.
   `CableManager` currently appends its SVG straight to `document.body`
   (`Patcher.js` ~line 105), sized to 100% / 100% of the *viewport*,
   completely independent of any scrolling. It needs to live inside the
   same scrollable canvas container instead, sized to match the virtual
   canvas — then cables scroll naturally with the widgets via normal
   browser scrolling, no per-scroll-event recompute needed.
4. **Coordinate math is likely fine as-is** — drag and cable-endpoint
   calculations already use jQuery's `.position()` (relative to the
   nearest positioned ancestor), not `.offset()` (viewport-relative), so
   once step 1 is done these should resolve correctly against the new
   container automatically. Still the part to verify most carefully once
   built — most likely place a hidden edge case surfaces.
5. **No migration risk for saved patches** — `#patcherRegion` stays
   docked at the same on-screen position, and widget `left` / `top`
   values in saved `.ntk` files don't change meaning. Old patches should
   render identically.
6. **Panning interaction** — native scrollbars come for free once 1–3 are
   done. A nicer "click-drag the empty background to pan" interaction
   (common in Max / Pd-style tools) is a separate additive UX layer, not
   required to ship v1.

## Out of scope for the panning pass: zoom

The harder half. Needs `transform: scale()` plus correcting every
mouse-coordinate calculation for the zoom factor (drag, cable drawing) —
a classic source of subtle off-by-scale bugs. Noted separately, not part
of the panning scope.
