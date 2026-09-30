# Sensor fusion

**Status:** design spec with options, not started. Grew out of a
2026-09-19 question about whether Gesture could use multi-axis
accelerometer input; scope widened to dissimilar-sensor fusion too
(soil moisture + salinity, weight + light).

Two genuinely different problems came up in the same conversation.
They don't need the same answer, and aren't mutually exclusive:

1. **Combining several sensor readings into one meaningful number**
   (e.g. a "soil health index" from moisture + salinity) - no pattern
   matching involved, just math on live values.
2. **Better gesture recognition from multi-axis motion** (e.g.
   distinguishing a shake from a circle from a tilt using accelerometer
   X/Y/Z together) - pattern matching over time, where Gesture already
   lives.

## Grounding facts (checked against the real code, not assumed)

- **Process** (`app/scripts/views/Process/Process.js`) has exactly one
  inlet and does fixed `+ - * /` against an internal operand
  (`app/scripts/utils/SignalChainFunctions.js`'s `math()`) - no
  multi-input math at all. Ruled out as a base for this.
- **Mix** (`app/scripts/views/Mix/Mix.js`) has 4 inlets and combine
  modes `latest`/`avg`/`sum`/`mult`/`min`/`max`. `sum` on same-quantity
  axes (accelerometer X/Y/Z) can cancel out real movement when values
  have opposite signs, and no mode computes a true magnitude/RMS.
  Extending Mix directly was considered and rejected - see Option A.
- **GroveSensor** (`app/scripts/views/GroveSensor/GroveSensor.js`,
  catalog in `sensorCatalog.js`) already exposes multi-axis sensors
  (the LIS3DHTR accelerometer) as **separate** per-axis outlets (x/y/z),
  each independently scaled via `inputFloor`/`inputCeiling` into NTK's
  usual 0-1023 range. This is why dissimilar-sensor fusion is more
  tractable than it sounds: everything reaching a combiner is already
  on comparable numeric footing regardless of physical units, since
  each source widget normalizes its own reading before it ever leaves
  the widget.
- **Gesture** (`app/scripts/views/Gesture/Gesture.js`) has exactly one
  inlet; its DTW implementation (`dtwDistance`, `rangeOf`) operates on
  flat arrays of scalars, with a per-cell cost of `Math.abs(a-b)` - a
  1D distance, not a vector distance. Its own in-widget dial (`onRender`)
  matches this project's hardware-free-testing convention (CLAUDE.md).
  The DTW matrix/outer-loop structure itself is dimension-agnostic; only
  the cost function and the surrounding scalar-array assumptions
  (recording, `trimStillness`, template storage, preview drawing) are
  1D-specific. A real, bounded, but non-trivial redesign - see Option B.

## Option A: general-purpose "Fusion" widget (solves problem 1, and is a partial answer to problem 2)

A new widget (working name **Fusion**) that combines several inputs
into one output - effectively Mix, generalized:

- **Up to 6 inlets** (`in1`...`in6`), fixed set (like Mix's fixed 4,
  just more of them for the dissimilar-sensor case).
- **Per-inlet weight** (default 1.0, positive or negative), set in the
  "more" panel - the capability Mix lacks, and the thing that matters
  most for dissimilar sensors (you rarely want moisture and salinity
  weighted equally the way 3 accelerometer axes naturally are).
- **Combine modes** (main-body dropdown): weighted sum; weighted
  average; **magnitude/RMS** (`sqrt(Σ(weight·value)^2)` - the real
  vector-magnitude case); min/max/latest for parity with Mix.
- **Output scaling**: weighted sum/magnitude can exceed 0-1023 - either
  clamp by default or offer a "normalize by total weight" toggle. Not
  yet decided which default is better.
- **Main body (94x110px, per CLAUDE.md's widget design principles)**:
  combine-mode dropdown + a live preview of the current combined
  output, so the widget's behavior is visible rather than a black box.
- **"More" panel**: per-inlet weight controls + a live readout of each
  inlet's current value, so a user can see what's driving the result
  while tuning weights.
- **Hardware-free testing**: Fusion's own inputs come from other
  widgets' outlets (which may have their own simulation dials, e.g.
  Knob/AnalogOut) - Fusion doesn't need its own simulated input, but
  its live readouts mean a user wiring in fake Knob values can still
  see the whole pipeline work with nothing physical attached.

**What this does and doesn't solve for Gesture**: wiring Fusion's
magnitude output into today's unchanged single-inlet Gesture gives
*crude* multi-axis gesture triggering (e.g. "any fast movement on any
axis") but throws away shape information - two very different
movements can share a similar magnitude profile while differing
completely per-axis, so Fusion-then-Gesture can't distinguish them.
For problem 1 (dissimilar-sensor combining), this has no such
limitation - it's the right tool outright, not a compromise.

## Option B: multi-channel Gesture (solves problem 2 properly; separate, bigger project)

A dedicated redesign of Gesture (or a new sibling widget) that natively
records and matches multi-channel input instead of collapsing it first:

- Multiple inlets (e.g. 3, for X/Y/Z) instead of 1.
- Templates stored as arrays of vectors instead of arrays of scalars.
- DTW cost function changed from `Math.abs(a-b)` to a real vector
  distance (Euclidean or weighted per-channel).
- Movement/stillness detection (`rangeOf`, `MOVEMENT_RANGE`,
  `STILLNESS_WINDOW_SAMPLES`) reworked to operate per-channel or on a
  combined magnitude rather than one flat array.
- Recording/preview UI (`drawSlotPreview` et al.) needs a multi-line or
  per-channel view instead of one waveform.

This is real, scoped work - not a simple reuse of existing Gesture
code - but the DTW algorithm's core matrix/loop structure doesn't need
restructuring, only the cost function and the 1D-specific surrounding
code. Not started; no line-level implementation plan yet, just the
shape of the change.

## Recommendation

Build **Option A (Fusion)** first regardless of which problem matters
more right now - it's smaller, stands on its own for dissimilar-sensor
combining, and is useful for other purposes (or crude multi-axis
triggering) even before any Gesture change happens. Treat **Option B**
(multi-channel Gesture) as a separate, later project, only worth doing
if real gesture-recognition accuracy on multi-axis motion turns out to
matter in practice - not a prerequisite for Option A, and not
superseded by it either.

## Not decided

- Fusion's exact naming (check for collisions with existing widget
  names before building).
- Output-scaling default (auto-clamp vs. normalize-by-weight toggle).
- Whether Option B, if built later, reuses the Gesture widget in place
  or ships as a new sibling widget instead.
