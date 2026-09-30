# LLM

The LLM widget sends a prompt to a large language model and sends the model's reply out its outlet. Feed it a question or a block of text (typed into the widget, or wired into the **prompt** inlet), pick how it should respond, and the answer comes out the **text** outlet as a string — ready for a Text widget, SpeechOut, CloudOut, or anything else that takes text.

It talks to two kinds of model:

- **Ollama (local)** — the default. Runs models on your own machine, no API key, nothing leaves the computer. You need [Ollama](https://ollama.com) installed and running, with at least one model pulled (`ollama pull llama3.2`).
- **Anthropic** — Claude models over the API. Fast and high quality, but needs an API key and sends your prompt to Anthropic's servers.

The LLM widget needs the NTK **desktop app** — it does not work in a plain web browser. All model calls go through the app's background process, so your API key never touches the patch file or the browser.

## How it works

- **Type a prompt** into the *prompt / text* box in the "more" panel, or wire a string into the **prompt** inlet (from a Text widget, SpeechIn, a Button, another LLM…).
- Pick a **response task** from the dropdown in the widget body:
  - **Answer** — answer the prompt directly.
  - **Rewrite** — rewrite the incoming text as a new version.
  - **Summarize** — condense the incoming text, or an attached document if one's attached (see "Attaching a document" below) — no typed prompt needed in that case.
  - **Argue with** — make the strongest case against the incoming text.
- **Click send.** The button pulses while the request is in flight. The reply appears (truncated) in the widget body, and the full text goes out the **text** outlet.
- Turn on **auto-send on new prompt** (right under the prompt box in "more") to fire automatically whenever the prompt changes — typed or wired in — so `SpeechIn → LLM → SpeechOut` runs with nothing to click. A **settle (ms)** field appears next to the checkbox once it's on — the widget waits that long after the last change before sending, so a source that updates in bursts (a few words at a time from SpeechIn, or your own typing) doesn't fire off a separate request for every partial update. Defaults to 2000ms, longer than a Text widget's fixed 400ms, since firing mid-utterance is more costly to get wrong than a local display update.

The small status line under the send button shows `idle`, `calling`, or an error (`no prompt`, `pick a model`, `Ollama not reachable`, a key problem, etc.).

## Setting up an API key (Anthropic)

Switch **provider** to *Anthropic* in the "more" panel, then click **set up key**. That opens a file called `ai-keys.toml` in NTK's app data folder. Add your key:

```toml
[anthropic]
api_key = "sk-ant-..."
```

Save the file, then switch provider away from and back to *Anthropic* (or just wait a moment) — the model list refreshes automatically. The key row should now read "key found (ai-keys.toml)". Setting the `ANTHROPIC_API_KEY` environment variable works too and takes priority.

The key lives only in that file — it is never written into the `.ntk` patch, so patches are safe to share.

## Personality — shaping the response

Click **▸ personality** in the "more" panel to open it (closed by default — it's a lot of controls for something you won't always need). It builds part of the system prompt from a set of structured choices; as you change them, the assembled prompt updates live at the bottom of the panel so you can see exactly what the model is being told.

- **random** — set the four traits and the temperature to a random combination (purpose and audience are left as they are). Good for exploring tones you wouldn't have picked.
- **reset** — clear the personality back to defaults: all traits none, purpose/audience/length/extra-instructions empty, temperature 0.7. (The response task is left alone.)
- **4 trait dropdowns** — qualities to write with (humor, scientific, conciseness, persuasive, conservative, kind…). Set any to **other…** to type your own.
- **purpose** — what the text is for: "an executive summary", "an essay", "an email", "a social media post"… or **other…** for your own. **(none)** adds no purpose instruction.
- **audience** — "an executive", "an engineer", "a general reader", "a friend"… or **other…**. **(none)** adds no audience instruction.
- **length** — a target word count. In **Rewrite** mode it's read as a percentage of the original instead (e.g. `50` = half as long).
- **temperature** — higher = more varied and creative, lower = more focused and repeatable. The slider goes to **2.0** for Ollama, **1.0** for Anthropic.
- **Markdown response** (on by default) — ask for the reply formatted as Markdown. Pair with a Text widget set to *Render Markdown* to show it formatted.
- **extra instructions** — free text appended to the system prompt for anything the dropdowns don't cover.

## Attaching a document (PDF or text file)

In "more" → **▸ document attachment**, click **browse** to attach a PDF, `.txt`, or `.md` file. Its text is pulled out once, right when you attach it, and rides along with every send from then on — not RAG (no search, no chunking), the whole document goes to the model every time, the same way typed text already would. Once attached, its filename appears there with **remove** and **Show in Finder** buttons next to it.

With a document attached, picking **Summarize** in the widget body summarizes *the document* — you don't need to type or wire in anything separately, just click send. If you do type something while Summarize is selected, it's treated as extra guidance for the summary (e.g. "focus on the budget numbers") rather than a second piece of text to summarize.

Two checkboxes in the "more" panel control how the document is used — independent, not exclusive, so both can be on at once:

- **match its voice & personality** — write in the same style, tone, and attitude as the document, not just answer using it.
- **answer only from it (grounded)** — stick to what's actually in the document; if the answer isn't there, say so rather than guessing.

None checked = the document is still available as background context, just with no particular instruction about how to use it.

A PDF that's scanned/image-only (no real text layer) shows "No extractable text found" instead of silently sending nothing. A very long document is capped at ~20,000 words, noted as "(truncated)" in the "more" panel word count if it happens.

## Settings ("more" panel)

- **provider** — Ollama (local) or Anthropic.
- **model** — populated from the provider automatically (on render, and whenever you switch provider). For Ollama it lists the models you've pulled, sorted alphabetically; for Anthropic, the current Claude models in their normal (current-flagship-first) order. A model saved in a patch stays selectable even if it's no longer listed. Switching provider and back restores whichever model you last picked for that provider, instead of resetting to a default each time.
- **max tokens** — hard cap on the reply length (default 1024). Raise it for long outputs.
- **base URL** — override the provider endpoint. Defaults to `http://localhost:11434` for Ollama, blank (Anthropic's own) for Anthropic. Point it at a remote Ollama box to offload the work.
- **system prompt (assembled)** — read-only preview of what the personality settings produce.

## Notes

- **Some Claude models don't accept a temperature setting.** When that happens the request is automatically retried without it and the status line notes "this model ignores temperature" — the reply is still fine.
- **"Ollama not reachable"** — Ollama isn't running, or isn't on the base URL shown. Start it (`ollama serve`) and check the port.
- **"pick a model"** — the model list is empty. For Ollama that means no models are pulled yet; for Anthropic, check the key and hit refresh.
- **"no prompt"** — the prompt box is empty and nothing's wired into the inlet. The one exception: **Summarize** with a document attached needs neither — send with nothing typed to summarize the document.
- The reply in the widget body is truncated for display — the outlet always carries the complete text.
- Each send is a fresh request; the LLM widget does not keep a conversation history. To build context, assemble it into the prompt yourself (e.g. with a Text widget).

## Example patches

- **Text → LLM → Text** — rewrite or summarize a block of text, show the result formatted.
- **Attach a PDF, LLM (Summarize) → Text** — click send with nothing typed to get a summary of the whole document.
- **SpeechIn → LLM → SpeechOut** (auto-send on) — a spoken back-and-forth.
- **GroveIn → Text (building a sentence) → LLM → SpeechOut** — have the model narrate what a sensor is doing.
- **LLM → CloudOut** — post a generated status message to a feed.
