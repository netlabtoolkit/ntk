# LLM widget

**Status:** in progress (started 2026-09-07). Part of the
[NTK plans](README.md).

A widget that calls an LLM. **Text prompt in the inlet → the model's text
response out the outlet.** The user sets the provider and picks a model
from that provider, and shapes the response through a set of structured
"personality" controls (see below).

This fits NTK's purpose directly — AI widgets exist because NTK is for
quick prototyping by non-technical designers, and an LLM-in-the-loop
(speech → LLM → speech; sensor context → LLM → action) is squarely on
that path.

## Widget shape

- **typeID:** `LLM` (display name "LLM" or "Prompt" — decide; can be
  overridden via `ToolBar.js`'s `WIDGET_DISPLAY_NAMES` if the type string
  isn't a good label, same as `GroveSensor` → "GroveIn").
- **Category:** `'AI'` (already exists — FaceTrack / Gesture / PoseTrack
  use it).
- **Base class:** `WidgetMulti`, like every recent widget.
- **Inlets:** `in` — the text prompt (a string). Optionally a second
  "bang" inlet that fires the request when it receives anything, so the
  prompt can be set without firing.
- **Outlet:** `out` — the text response (a string).

Text I/O follows the SpeechIn → SpeechOut convention already in the
codebase (an `output` string model field drives the outlet; SpeechOut
takes a string inlet). `SpeechIn → LLM → SpeechOut` is then a natural
voice-assistant patch.

## Prompt "personalities" — the structured-prompt model

From Phil's article *Multiple Personalities for AI Prompts*
(philvanallen.substack.com). Instead of the user writing a raw system
prompt, the widget **assembles a well-structured system prompt from a
handful of structured fields**. Each configured LLM widget is one
"personality"; wiring several of them off the same prompt source and
into a Splitter/compare setup gives the article's side-by-side
comparison the NTK way (one widget per personality, not one tool with N
columns).

The configurable dimensions (the widget builds the system prompt from
these):

1. **Mode** — `Answer` (respond to a question/prompt) / `Rewrite`
   (produce a variation of the input text) / `Summarize` (prose or
   bulleted). Sets the base instruction.
2. **Model** — provider + model id (see Providers below).
3. **Temperature** — response randomness / creativity. **Caveat:** the
   current-generation Anthropic models (Opus 5, Sonnet 5, Fable 5/5.1,
   Opus 4.7/4.8) **reject `temperature` with a 400** — sampling params
   were removed in favour of `effort`. Ollama accepts it fully, and
   older Anthropic models (Haiku 4.5, 4.6) accept it. The proxy sends
   `temperature`, and on an Anthropic 400 that references
   temperature/sampling it retries without it and flags that in the
   result so the widget can note "temperature not supported by this
   model".
4. **Response length** — a number. Meaning depends on Mode: words for
   Answer/Summarize, a percentage of the original for Rewrite. Becomes a
   length clause in the system prompt (a soft instruction, not
   `max_tokens`).
5. **Personality traits** — free text, e.g. "professional, scientific",
   "sarcastic, funny". Becomes a "write with these qualities" clause.
6. **Context — purpose / format** — free text or a loose picker: essay,
   presentation, email, notes... Becomes a "format the output as..."
   clause.
7. **Context — audience** — free text or a loose picker: executive,
   scientist, engineer, general reader... Becomes a "write for this
   audience..." clause.

Assembly (in the widget, before the proxy call):

```
system = [
  MODE_PREAMBLE[mode],
  traits   && `Write with these qualities: ${traits}.`,
  format   && `Format the output as: ${format}.`,
  audience && `Write for this audience: ${audience}.`,
  lengthClause(mode, length),
  systemAppend,          // optional advanced raw text appended verbatim
].filter(Boolean).join('\n')
```

The user text (inlet or the widget's own text box) is the `user`
message. In Rewrite/Summarize modes it's "the following text"; in Answer
mode it's the question.

A saved patch already persists all widget model state, so a configured
LLM widget **is** a saved personality. Cross-patch reuse = copy the
widget, or (later) a preset export.

## Providers

Provider dropdown, four entries:

1. **Anthropic** — `POST {base}/v1/messages`, headers `x-api-key`,
   `anthropic-version: 2023-06-01`. Body `{model, max_tokens (required),
   system?, messages: [{role: "user", content: prompt}]}`. Response text:
   the `content[]` blocks with `type === "text"`, concatenated. Models:
   `GET /v1/models`.
2. **OpenAI** — `POST {base}/v1/chat/completions`, header
   `Authorization: Bearer <key>`. Body `{model, messages: [{role:
   "system", ...}?, {role: "user", content: prompt}], max_tokens?,
   temperature?}`. Response: `choices[0].message.content`. Models:
   `GET /v1/models`.
3. **Ollama** (local) — `POST {base}/api/chat`, body `{model, messages,
   stream: false}`. Response: `message.content`. No API key. Models:
   `GET {base}/api/tags` → `models[].name` (must be dynamic — the
   installed model set is entirely per-user). Default base URL
   `http://localhost:11434`.
4. **OpenAI-compatible (custom)** — the OpenAI request shape with a
   user-supplied base URL. Covers Groq, OpenRouter, Together, LM Studio,
   llama.cpp server, vLLM, etc. in one entry.

Model IDs change frequently — fetch the provider's models endpoint
dynamically rather than relying on a hardcoded list as the only source.

## Where the HTTP call happens: server-side proxy via Electron IPC

A `server/llmProxy.js` module, wired into `electronApp.js` /
`preload.js` the **same way the SpeechIn/SpeechOut helpers were** —
`ipcMain.handle('llm-complete', ...)` / `ipcMain.handle('llm-models',
...)`, exposed to the renderer through the `contextBridge` in
`preload.js` as `window.ntkElectron.llmComplete(opts)` etc. Not
socket.io — the speech work established Electron IPC as the pattern for
new main↔renderer features, and it keeps keys entirely in the main
process.

The widget calls with `{provider, model, baseURL, system, user,
maxTokens, temperature}` — **no API key in this payload**, the main
process resolves it — and gets back `{text}` or `{error, code}`.

Node 22 in the Electron main process has global `fetch`, so no HTTP
dependency is needed.

Rejected alternative: client-side `fetch` from the widget (the pattern
CloudIn uses). Anthropic and Ollama could work client-side, but OpenAI
can't (CORS), and client-side means keys live in the renderer / patch
file.

## API key storage: server-resolved, never in the patch

Keys are never stored in the widget model or the `.ntk` patch. The proxy
resolves the key for the selected provider from one of:

1. **A user-selected keys `.toml` file** (preferred). One app setting is a
   file path, chosen via an Electron file-picker dialog. This mirrors the
   CircuitPython firmware's existing `settings.toml` convention — ship an
   `ai-keys.toml.example` alongside. Shape:

   ```toml
   [anthropic]
   api_key = "sk-ant-..."

   [openai]
   api_key = "sk-..."

   [custom]
   api_key = "..."
   base_url = "https://..."
   ```

   Keeps keys out of the repo, portable, easy to git-ignore, familiar.

2. **App-level settings fields** — keys entered in an NTK settings panel,
   stored in Electron `userData` as a JSON file the server process reads
   directly (not `localStorage`, which is renderer-only and invisible to
   the server). Quicker for a single key / first run.

**v1 resolution order (Anthropic only — Ollama needs no key):**

1. `ANTHROPIC_API_KEY` env var (dev convenience).
2. `<userData>/ai-keys.toml`, section `[anthropic] api_key = "..."`.
   `<userData>` = `app.getPath('userData')` (per-user, outside the app
   bundle, survives updates). Ship `server/ai-keys.toml.example`; the
   widget's error state points at the exact path and offers a button
   that reveals it in Finder (`shell.showItemInFolder` on the example,
   or `shell.openPath` on the folder).

The `.toml` is flat, so a ~15-line parser (sections + `key = "value"`,
`#` comments) beats adding a dependency. No file-picker for v1 — the
file lives at the known path.

The widget's "more" panel has **no API key field**. It shows a read-only
line — the key source and whether a key was found for the selected
provider, never the value — and (for Anthropic with no key) a "set up
key" button.

## Widget layout

**Body (compact):**
- **Mode** selector — Answer / Rewrite / Summarize (small segmented or
  select).
- **Send button** — manual trigger, per CLAUDE.md's "test without
  hardware".
- **Status** — idle / calling (pulsing) / error.
- Truncated preview of the last response.

**"more" panel:**
- **provider** — Anthropic / Ollama (v1).
- **model** — dropdown, rebuilt when provider changes; populated by
  fetching the provider's models endpoint (`GET /v1/models` for
  Anthropic, `GET {base}/api/tags` for Ollama), with a small hardcoded
  fallback list and a free-text field for a model not in the list.
- **key** — read-only status line (Anthropic only); "set up key" button
  when missing.
- **temperature** — number (0–1ish). Note shown if the selected
  Anthropic model rejected it.
- **length** — number; label changes with mode ("words" / "% of
  original").
- **traits** — free text.
- **format** — free text / loose picker.
- **audience** — free text / loose picker.
- **advanced:** system-prompt append (verbatim), base URL, max tokens,
  auto-send toggle.

The assembled system prompt is shown read-only in the advanced area so
the user can see what the structured fields produced (matches the
article's "automatically provide well structured prompts").

## Triggering (each call may cost money)

- **Default: manual** — the Send button, and/or the "bang" inlet.
- **Optional: auto-send on `in` change**, debounced (~500 ms), off by
  default, with a cost warning near the toggle.

## v1 scope

- **Single-turn / stateless** — each send is an independent `{system,
  user: prompt}` call. No conversation history. This is the simplest and
  most "widget-like" form (a pure text transform). Multi-turn (with a
  "clear history" button and a history cap) is a clear later extension.
- **Non-streaming** — wait for the full response, emit once on the
  outlet. Streaming with progressive outlet updates is a later toggle,
  but note it makes every downstream widget re-process partial text
  repeatedly.
- **Providers:** Anthropic + Ollama for v1 (Ollama is the zero-cost local
  test path); OpenAI + custom right after.
- **Trigger:** Send button + auto-send toggle (off by default). No
  separate "bang" inlet in v1.
- **Personality fields:** all seven dimensions from the article, with
  free-text for traits/format/audience (loose pickers can come later).

## Error handling

Shown in the widget body: "No API key" / "Invalid key" (401/403) / "Model
not found" (404) / "Rate limited" (429) / "Ollama not running"
(connection refused to `localhost:11434`) / "Can't connect" / "Bad
response".

## NTK-pattern reminders (from CLAUDE.md)

- Register any custom `rivets.binders.*` / `formatters.*` **before**
  calling `WidgetView.prototype.onRender.call(this)`.
- No per-widget `styles.scss` (never loaded) — add a `.llm { }` block to
  `app/styles/Widget.scss`.
- Keep the main body at the standard 94×110 px; all config goes in the
  "more" panel; don't widen `.widgetBody`.
- `<input>` values via `rv-value` are always strings — `parseInt` /
  `parseFloat` max tokens / temperature at the point of use.
- Internal instance state referenced by `onModelChange` /
  `processSignalChain` must be initialized before the
  `this.model.set(defaults)` call in `initialize()`.

## Implementation notes

- Build provider handling behind a small adapter interface
  (`{listModels(), complete(prompt, opts)}`) so a fifth provider is one
  file.
- The key resolver (widget override → `.toml` → app settings) is separate
  from the adapters.
- Same external-service + user-API-key shape as CloudIn/CloudOut, but
  CloudIn stores its key in the widget model (in the patch) — this widget
  deliberately does not.
