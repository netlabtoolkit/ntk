# LLM widget

**Status:** planned, not started. Part of the [NTK plans](README.md).

A widget that calls an LLM. **Text prompt in the inlet → the model's text
response out the outlet.** The user sets the provider and picks a model
from that provider.

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

## Where the HTTP call happens: server-side proxy

A small `server/` module the widget calls over the current
client↔server channel with `{provider, model, baseURL, system, prompt,
maxTokens, temperature}` — **no API key in this payload**, the server
resolves it (see below) — returning `{text}` or `{error}`.

This avoids browser CORS entirely (OpenAI blocks it), keeps API keys off
the renderer and out of the saved patch file, and puts provider handling
in one place.

The proxy is channel-agnostic — a function `complete({provider, model,
...}) → {text} | {error}`. Only the thin wiring that invokes it depends
on the client↔server mechanism (socket.io now, Electron IPC later), so
that wiring is the only part that changes when the channel does.

Rejected alternative: client-side `fetch` from the widget (the pattern
CloudIn uses). Anthropic and Ollama could work client-side, but OpenAI
can't, and client-side means keys live in the renderer / patch file.

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

Resolution order in the proxy: a per-widget override (rare, e.g. a base
URL) → the `.toml` file if a path is set → the app-level settings.

The widget's "more" panel has **no API key field**. Instead it shows a
read-only line — which key source is active and whether a key was found
for the selected provider, never the value — plus a link to the AI-keys
settings.

Node has no built-in TOML parser; add a small dependency (`smol-toml` or
`@iarna/toml`), or a ~20-line parser since the file is flat.

## "more" panel config

- **Provider** dropdown (the four above).
- **Model** dropdown — rebuilt whenever Provider changes (same pattern as
  GroveSensor's per-sensor mode dropdown, rebuilt in `remapSensor()`).
  Populated by fetching the provider's models endpoint, with a curated
  fallback list per provider, a "refresh" affordance, and a free-text
  override for models not in the list.
- **Key source line** (read-only) — see "API key storage" above.
- **Base URL** field — default per provider; lets any provider be pointed
  at a proxy; for Ollama, where a non-default host/port goes.
- **System prompt** field — optional, multiline.
- **Max tokens** field — default ~1024.
- **Temperature** field — optional.
- **Auto-send** toggle — see Triggering; off by default.

## Main body

- **Send button** — manual trigger. Per the "test without hardware"
  principle in `CLAUDE.md`: type a prompt, hit send, see it work with
  nothing else wired up.
- **Status indicator** — idle / calling / (streaming) / error, with a
  visible spinner or pulse while a request is in flight. A request with
  no visible state reads as broken.
- Optionally, a small truncated preview of the last response.

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
