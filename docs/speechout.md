# SpeechOut

The SpeechOut widget speaks text out loud. Send it words (from a Text
widget, a Keyboard, SpeechIn, an LLM, anything that produces a string)
and it reads them through your computer's speakers.

On **macOS** it uses Apple's speech engine, which can use the
high-quality neural ("Premium") voices — but **you have to download those
voices yourself first** (see below). On Windows/Linux it uses the
browser's built-in speech synthesis.

## Download the good voices first (macOS)

Out of the box, macOS only has the plain built-in voices (Samantha,
Daniel, and friends). They sound robotic — "just okay". The good ones are
a free download:

**System Settings → Accessibility → Spoken Content → System Voice →** the
**ⓘ** button (or "Manage Voices…") **→** expand your language **→**
download a voice marked **(Premium)** or **(Enhanced)**.

- **Premium** voices are neural — close to Siri quality. ~100–500 MB each.
- **Enhanced** voices are a step up from the built-in ones, smaller.
- Good English picks: **Zoe (Premium)**, **Ava (Premium)**.

Once downloaded, they appear in SpeechOut's **voice** menu under a
**Premium** / **Enhanced** heading, and the widget defaults to a Premium
voice automatically. Until you download at least one, the widget notes
"Tip: download Premium voices in System Settings" and you're stuck with
the basic voices.

(This only applies to the Mac path. On Windows the browser already
exposes the good "Natural" voices, so there's nothing to download.)

## How it works

- Type text into the field in the "more" panel, or wire a string into
  the **text** inlet.
- **Click the play triangle** to speak it. The triangle becomes a
  pulsing red square while speaking — click again to stop.
- Or drive it from hardware: a signal crossing the **threshold** on the
  **trigger** inlet starts playback.
- With **autoplay** on (the default), SpeechOut speaks automatically
  whenever the text inlet changes — so `SpeechIn → SpeechOut` just works
  with nothing to click.

## Settings ("more" panel)

- **voice** — grouped **Premium → Enhanced → Default**. English voices
  are listed first. On Windows/Linux this lists the browser's voices
  instead.
- **rate** — how fast it talks. Middle is normal.
- **threshold** — the trigger-inlet level (0–1023) that starts playback.
- **autoplay** — speak whenever the text inlet changes (on by default).
- **autocancel on trigger release** — when the trigger drops back below
  the threshold, stop any speech in progress.
- **text** — the words to speak. The text inlet writes here too.

## Notes

- The small grey word in the widget body (`apple` or `web`) tells you
  which engine is running.
- A patch saved on a Mac with a Premium voice, opened on a machine that
  doesn't have that voice, falls back to a default voice rather than
  going silent.
- SpeechOut needs the NTK **desktop app** — it doesn't work in a plain
  web browser.

## Example patches

- **Text → SpeechOut** — read a fixed message on a trigger.
- **SpeechIn → SpeechOut** — echo speech back.
- **AnalogIn → SpeechOut** (with a Text/Process widget building the
  string) — announce a sensor value.
