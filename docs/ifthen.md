# IfThen

The IfThen widget compares an incoming value against a condition you set, and sends one of two output values out its outlet depending on whether the condition is true or false — the core branching/logic widget for a patch.

It works on either numbers or text, picked with the **Numeric Input** / **Text Input** radio buttons in the widget body.

## How it works

- Wire a value into the **in** inlet, or watch the live readout in the widget body update as it changes.
- **Numeric Input** — compares the incoming number against **compareValue** using the chosen operator: **>**, **<**, or **~=** (within range — see **~= range** in "more").
- **Text Input** — compares the incoming text against the comparison string set in "more" using the chosen operator: **equals**, **contains**, or **part** (see below for exactly what each one checks).
- Whichever comparison is true, the widget outputs the **true** value; otherwise it outputs the **false** value — shown as the two small boxes on the right of the widget body (defaults 1023 and 0). Edit either one directly.
- The box for whichever state is currently active is highlighted. If a wait time is set (see below) and the state just changed, that box blinks instead of showing solid, until the wait finishes and the new state is confirmed.
- The result goes out the **out** outlet, ready to drive an AnalogOut, another IfThen, a CloudOut, or anything else.

## Text comparison — equals vs. contains vs. part

These three read differently enough that it's easy to get backwards:

- **equals** — true only if the incoming text matches the comparison string exactly (case-insensitive, leading/trailing whitespace ignored).
- **contains** — true if the incoming text contains any one of the comparison string's comma-separated phrases anywhere within it. E.g. a comparison string of `hello, hi, hey` matches an incoming "well hello there" (contains "hello"). The delimiter is set by **text delimiter** in "more" (default `,`).
- **part** — the reverse direction: true if the *incoming* text is found as a substring *within* the comparison string. E.g. a comparison string of "the quick brown fox" matches an incoming "brown". Useful when the comparison string is the longer reference phrase and the inlet carries short keywords to check against it.

## Settling — wait true / wait false

**wait true** and **wait false** (in "more", milliseconds, default 0 = instant) delay committing a state change until the condition has held steady for that long — useful for a noisy or bouncy input where you don't want the output flickering on every brief true/false blip.

While waiting, the widget still reports the *other* state's value (so nothing downstream sees a change yet) and blinks the box for the state it's waiting to confirm. If the input flips back before the wait finishes, the wait is abandoned and nothing changes.

## Settings ("more" panel)

- **~= range** — for the numeric **~=** operator, how wide a band around **compareValue** counts as a match (the range is centered on compareValue, so a range of 150 matches ±75).
- **wait true** / **wait false** — settle time in milliseconds before committing to each state (see above). 0 = immediate.
- **text comparison string** — the text (or comma-separated phrases, for **contains**) compared against the incoming text in Text Input mode.
- **text delimiter** — what splits the comparison string into separate phrases for **contains** (default `,`).

## Notes

- The widget-body readout shows the raw incoming value: the actual number for Numeric Input, or the text (truncated to fit, hover to see the full value) for Text Input.
- Text Input mode is case-insensitive and trims whitespace on both the incoming value and the comparison string before comparing.
- Switching between Numeric Input and Text Input doesn't clear either mode's settings — flip back and forth freely without losing your compare value or comparison string.

## Example patches

- **AnalogIn → IfThen (~=) → DigitalOut** — turn something on only while a sensor reading sits within a target band.
- **SpeechIn → IfThen (Text Input, contains) → SpeechOut** — respond only when a spoken phrase contains a trigger word.
- **GroveIn (distance) → IfThen (>) → LLM (auto-send)** — prompt a model only once something crosses a threshold.
- **IfThen → IfThen** — chain conditions together for simple multi-step logic.
