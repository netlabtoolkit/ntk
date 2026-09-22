# Text

The Text widget shows text on the canvas in a movable, resizable box —
and passes that text straight through its outlet, so it can sit inline in
a chain of text widgets instead of being a dead end.

Use it as a label, a live readout of an incoming string, a scratch area
you type into, or a Markdown viewer for the output of an LLM or SpeechIn.

## The on-canvas text box

When you place a Text widget, a separate box appears on the canvas (not
attached to the widget body). That box is what the audience sees.

- **Drag** it anywhere on the canvas. It stays put when you save the
  patch. If it ever ends up off-screen, it's clamped back to the edge so
  you can always reach it.
- **Resize** it from the bottom-right corner (or the bottom / right
  edges). The size is remembered in the patch.
- Text longer than the box **scrolls** inside it — the resize handle
  stays pinned in the corner while the text scrolls.
- With **Render Markdown** on (the default), the text is shown formatted
  — headings, **bold**, *italic*, lists, links, `code`, blockquotes,
  and rules. Any HTML in the text is shown as plain characters, never
  rendered.

## How it works

- Type into the **text** field in the "more" panel, or wire a string
  into the **in** inlet (from SpeechIn, an LLM, a Keyboard, CloudIn…).
- By default each new value **replaces** what's shown. Turn on **Append
  new text** to keep a running log instead.
- The **in** value is also sent straight out the **out** outlet
  unchanged — so `SpeechIn → Text → SpeechOut` shows the text *and*
  passes it along.
- Typing settles for about 400ms after your last keystroke before the
  outlet (and the on-canvas box) actually updates, so a fast typist
  doesn't push a new value out the wire for every character.
- Position and opacity can be driven live through the **X Position**,
  **Y Position**, and **opacity** inlets.

## Import / export

In the "more" panel, under *Displayed Text*:

- **import…** — open a `.txt` or `.md` file from disk; its contents load
  into the widget (and flow out the outlet).
- **export…** — save the current text to a file. The default name is
  `text.md`.

Both need the NTK **desktop app** — they don't work in a plain browser.

Below the buttons a small readout shows the **word count** and the **5
most frequent words** (case-insensitive, punctuation stripped, common
function words and one/two-letter words skipped). It updates live as the
text changes.

## Settings ("more" panel)

- **Hide text display / Show text display** — toggle the on-canvas box.
  Hide it when you're using the widget only as an inline pass-through or
  a prompt source and don't want the box in the way. The state is saved
  with the patch.
- **Append new text** — add each incoming value to the end instead of
  replacing.
- **width** / **height** — box size in pixels. Also set by dragging the
  resize handle.
- **class** — a CSS class name put on the text element, for styling from
  a custom stylesheet.
- **Font** — size (e.g. `18px`), color (hex like `#000000`), **Italic**,
  **Bold**, and a family dropdown (Arial, Tahoma, Georgia, Times,
  Courier New). These apply to Markdown-rendered text too; headings keep
  their relative size, bold/italic emphasis stays, and `code` stays
  monospace.
- **Render Markdown** — format the text as Markdown (on by default).
  Turn it off to show the raw characters, e.g. to display Markdown
  source.
- **text** — the string to show. The **in** inlet writes here too.

## Notes

- The Markdown renderer is a lightweight built-in subset, not a full
  Markdown engine — it covers the common cases (headings, emphasis,
  lists, links, code spans and fences, blockquotes, horizontal rules)
  and ignores the rest.
- HTML and script in the incoming text are always escaped, so text from
  an inlet, a file, or an LLM can't run code in the patch.
- The pass-through outlet means a Text widget added mid-chain won't break
  the signal — whatever arrives on **in** still reaches the next widget.

## Example patches

- **SpeechIn → Text** — show what was just said, formatted.
- **LLM → Text** (Render Markdown on) — display a generated answer with
  headings and lists.
- **CloudIn → Text → SpeechOut** — show an incoming feed value and read
  it aloud.
- **Text → LLM** — type a prompt in the box and send it to a model.
