# SpeechIn

The SpeechIn widget turns speech into text. Talk into your computer's
microphone and the words come out the outlet as a string, ready to feed
any text-using widget (Text, SpeechOut, and others).

On **macOS** it uses Apple's built-in speech recognition, which runs
**on-device** — no internet, no account, no API key, no time limit, and
your audio never leaves your machine. On Windows/Linux the widget shows
"not available" (a cross-platform option is planned).

## How it works

- **Hold the round record button and speak.** Words appear in the widget
  as you talk (a live preview), and the finished text is sent out the
  **text** outlet when you release the button.
- Or drive it from hardware: wire a sensor, button, or any signal into
  the **trigger** inlet. When that value rises past the **threshold**
  (default 512) recording starts; when it drops back below, recording
  stops and the text is sent.
- The record button pulses red while recording. The status line shows
  `recording`, then `transcribing`, then back to `idle`.
- The outlet **keeps its last result** — downstream widgets don't get
  blanked when you stop without speaking.

## First use

The first time you record, macOS asks for **Microphone** and **Speech
Recognition** permission. Both are required. If you decline, the widget
shows an error; you can re-enable them later in **System Settings →
Privacy & Security**.

## Settings ("more" panel)

- **language** — the language you'll be speaking. The list has a
  **Common** group (English, Spanish, French, German, Italian,
  Portuguese, Japanese, Chinese, Korean, Russian, Arabic, Hindi) and an
  **All other languages** group with everything else Apple supports
  (~60 languages total). If a language isn't in the list, Apple's
  recognizer doesn't support it.
- **threshold** — the trigger-inlet level (0–1023) that starts/stops
  recording. Only relevant when something is wired to the trigger inlet.

## Notes

- **On-device vs. server:** for most listed languages recognition runs
  entirely on your Mac. For a few, if the offline language model isn't
  installed, macOS falls back to Apple's servers — which needs internet
  and caps each utterance at about a minute. You can add offline
  languages under **System Settings → Keyboard → Dictation**.
- **Accuracy** depends on your microphone and background noise, same as
  any dictation. A headset mic in a quiet room is best; a laptop mic
  across a noisy room is worst.
- SpeechIn needs the NTK **desktop app** — it doesn't work when NTK is
  opened in a plain web browser.

## Example patches

- **SpeechIn → SpeechOut** — repeat back what you said.
- **SpeechIn → Text** — show the transcription on the canvas.
- **Button → SpeechIn → (LLM) → SpeechOut** — a push-to-talk voice
  assistant.
