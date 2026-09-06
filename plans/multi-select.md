# Multi-select

**Status:** design spec. Not started. Build-order step 3 (after the
wiring rebuild, before [Macro](macro-widget.md)).

Let the user select multiple widgets on the patch canvas at once
(rubber-band drag-select + shift-click), then move or delete them as a
group. Originally scoped as a [Macro](macro-widget.md) prerequisite — you
need a selection to consolidate into a macro — but independently useful
for general patch editing: rearranging complex patches, bulk-deleting a
group.

Grounded in the actual code (`views/composite/Widgets.js`,
`views/item/WidgetMulti.js`). There is currently **zero** existing
scaffolding: no click handler on the canvas background at all
(`Widgets.js`'s composite view has an empty `events: {}`), and each
widget is its own fully independent jQuery UI `draggable()` instance with
no shared / group concept.

## What's needed

1. **A selection-tracking layer** — nothing like this exists. A small new
   piece (could live on `Patcher.Controller`, which already tracks
   `this.widgets`) holding "which widget views are currently selected,"
   plus a CSS class (e.g. `.selected`) toggled on each selected widget's
   root element for a visible highlight.
2. **Rubber-band select** — mousedown-drag starting on *empty* canvas
   background (not on a widget) draws a temporary selection rectangle; on
   mouseup, any widget whose position + size intersects it gets selected.
   Straightforward geometry, but genuinely new — the canvas background
   has no mouse handling today.
3. **Shift-click to toggle** — click a widget's title bar while holding
   Shift to add / remove it from the selection without disturbing the
   rest. Needs care distinguishing this from jQuery UI draggable's own
   mousedown handling on the same element (`handle: '.dragHandle'`) —
   check `e.shiftKey` before drag-start and short-circuit into a toggle.
4. **Group drag — the one genuinely tricky part.** Right now, dragging a
   widget calls a private `updateCables` closure (inside `makeDraggable`
   in `WidgetMulti.js`) that updates *only that widget's*
   `offsetLeft` / `offsetTop` and *its own* attached cables — completely
   self-contained, no awareness of other widgets. Moving a selection
   together means: when any selected widget's `drag` event fires, compute
   the delta from drag-start and apply that same delta to every *other*
   selected widget's position (and re-run their own cable-update logic).
   That per-widget cable-update logic is currently a private closure, not
   a reusable method — it'd need pulling out into something callable from
   outside a single widget's own drag handler.
5. **Group delete** — a keyboard shortcut (Delete / Backspace) removing
   all selected widgets at once. Straightforward once selection-tracking
   exists, since each widget has its own `removeWidget` method.
6. **Clicking empty canvas clears the selection** — standard convention,
   cheap once rubber-band's background-click handling exists anyway.
