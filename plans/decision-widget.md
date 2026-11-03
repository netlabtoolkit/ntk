# Decide widget (System One decision models)

**Status:** plan only (2026-11-03). Not started. Scoped in discussion with Phil.

A new **AI** widget that turns text into decisions. It sends text plus a few multiple-choice questions to a "System One" decision model and gets back, in about a tenth of a second, a choice and a probability for each question. Those come out as numbers and names that can drive IfThen, outputs and other widgets directly.

It sits next to the [LLM widget](llm-widget.md), not inside it: the LLM writes text, Decide picks from answers you give it.

## Background: System One decision models

Facts from the sources read 2026-11-03: [Wikipedia: Jev (AI model)](https://en.wikipedia.org/wiki/Jev_(AI_model)), [TypeSafe docs](https://docs.typesafe.ai/), [Ollama: nimble](https://ollama.com/library/nimble), [Ollama blog: decision models](https://ollama.com/blog/ollama-now-supports-decision-models).

- **Jev** (TypeSafe AI, early access 15 Sep 2026, current `jev-1.14.0` / `jev-latest`) is the first "System One model", named after Kahneman's fast, intuitive thinking. It's a discriminative model: it classifies and scores, it doesn't generate text. Hosted only, needs an API key, $0.042 per million input tokens, output free.
- **Nimble** (Bespoke Labs, 9B, fine-tuned from Qwen3.5-9B, about 9.3 GB) is an open decision model that runs locally in **Ollama 0.35+**. Ollama also lists `tev1` (4B and 0.8B, Together AI, experimental) and a newer `nimble-v3`.
- Ollama serves them at **`/v1/systemone`**, which copies TypeSafe's API, so one request format covers local Nimble and hosted Jev.
- **Speed:** Ollama measured Nimble at about 91 ms per decision on an M5 Max; TypeSafe claims 70-500 ms for Jev. A normal LLM reply takes seconds.
- **Text only** (Jev has an image preview behind a header; ignore for now). English works best.

### Request

`POST {base}/v1/systemone`, JSON. Jev adds `Authorization: Bearer <key>`.

```json
{
  "model": "nimble",
  "state": "turn the lights down a bit, I want to relax",
  "questions": {
    "lights": {"type": "choice", "instructions": "What does the speaker want the lights to do?",
               "criteria": {"on": null, "off": null, "dim": null, "none": "Not about the lights"}},
    "upset":  {"type": "noul", "instructions": "Is the speaker frustrated or annoyed?"},
    "mood":   {"type": "score", "instructions": "How agitated is the speaker?",
               "criteria": ["calm", "neutral", "agitated"]}
  }
}
```

- `state`: a string, a JSON object, or an array of strings.
- 1-64 questions, answered independently and in parallel (one answer can't depend on another in the same request).
- `noul`: true/false, optional `criteria` `{"true": "...", "false": "..."}`.
- `choice`: `criteria` is an object of option to description (`null` = the name says it all); 2-26 options per Ollama, up to 255 per TypeSafe's schema.
- `score`: `criteria` is an array of levels, lowest first, numbered from 0; 2-26 levels per Ollama, max 10 per TypeSafe's schema. **Use 10 as the limit** so both work.
- No prompt to write: the server builds it from the questions.

### Response

```json
{"model": "nimble",
 "answers": {
   "lights": {"type": "choice", "choice": "dim", "probabilities": {"on": 0.02, "off": 0.01, "dim": 0.95, "none": 0.02}, "confidence": 0.9},
   "upset":  {"type": "noul", "noul": 0.08},
   "mood":   {"type": "score", "score": 0.4, "legend": {"0": "calm", "1": "neutral", "2": "agitated"},
              "probabilities": {"0": 0.62, "1": 0.36, "2": 0.02}, "confidence": 0.3}},
 "usage": {"input_tokens": 120, "output_tokens": 3}}
```

- `noul` answers are a bare probability of true: **no `confidence` field** (TypeSafe's schema).
- `score` is the probability-weighted level (0 to levels-1); legend and probabilities are keyed by strings.
- `confidence` (0-1) says how concentrated the probabilities are, not the chance the answer is right.
- Answers come back in the order the questions were sent. No streaming.

### Limits and open facts

- The model can only pick from the options given; it never explains or writes text. Always offer a "none" option.
- Nimble's Ollama page says 256K context, but its notes say the prompt must fit in 8,192 tokens. Keep `state` short and check on real hardware.
- Request bodies up to 64 KiB (Nimble).
- Probabilities aren't guarantees: 0.9 doesn't mean right 90% of the time on your data.

## The widget

Name: **Decide**. Category: **AI**. Main body 94x110 like every widget; configuration goes in the more panel.

### Inlets

- **text** - the `state`. Anything wired in (SpeechIn's transcript, a Text widget, an LLM reply, ObjectRecog's label) is converted to a string.
- **in2, in3** (optional, maybe later) - extra named values packed with the text into a JSON `state`, e.g. `{"said": "...", "temperature": 31, "time": "evening"}`, so a question can weigh a sensor reading too. Names set in the more panel.

### Questions: a short script

Written in the more panel's script box, in the same spirit as Scene's script (line numbers, errors marked as you type):

```
lights: choice on | off | dim | none=Not about the lights
        What does the speaker want the lights to do?
upset:  yes/no Is the speaker frustrated or annoyed?
mood:   score calm < neutral < agitated
        How agitated is the speaker?
```

- First line of each question: `name: type options`, then an optional indented instructions line.
- `yes/no` maps to `noul`; `choice` options separated by `|`, `option=description` gives criteria text; `score` levels separated by `<`, lowest first.
- NTK parses this into the request, so the designer never sees JSON.

### Outlets

**Fixed at four, tied to position (out1-out4), one per question in script order.** Not named after questions, so editing or regenerating the script never orphans cables (the GroveIn renamed-reading-key problem). Outlet tooltips show the question name.

What each sends:

| Question type | Outlet value |
|---|---|
| yes/no | probability of yes scaled to 0-1023 (NTK's usual range); a "binary" option sends 0 or 1023 at the threshold |
| choice | the winning option's name (a string, like ObjectRecog's `label`) |
| score | the weighted score scaled to 0-1023 |

Maybe also a **confidence** outlet for the first question, or a per-outlet "send confidence instead" option. Decide while building.

### Confidence threshold

A more-panel setting (default maybe 0.5): an answer below it doesn't update its outlet, which keeps outputs from flickering on uncertain input. For yes/no (no `confidence` field), the threshold applies to how far `noul` is from 0.5.

### When it asks

- **auto** (default): send a request whenever the text inlet changes, debounced (about 100 ms) so a stream of partial transcripts doesn't queue up requests. Latest wins: a reply to stale text is dropped.
- A **decide** button in the main body sends the current text by hand.

### Main body

- Each question's current answer, one line each (`lights: dim`, `upset: no`, `mood: calm`), with a small confidence bar.
- A status line: `deciding...` while a request is in flight, the round-trip time when done (e.g. `92 ms`), or the error (`Ollama not running`, `nimble not installed - ollama pull nimble`, `no API key`).
- A blink or highlight when an outlet value changes, so it's visible the widget acted.

### Testing without hardware

- A **text field in the widget** to type input directly (like SpeechOut's speak button): the whole patch logic can be checked with no microphone and no other widgets.
- The **test phrases** from the generator (below) are one-click inputs.

### Provider settings (more panel)

- **Provider:** Ollama (local, default) or TypeSafe (hosted Jev).
- **Model:** for Ollama, **`tev1:4b` by default** (decided 2026-11-03 after the spike: fits a 16 GB Mac, twice Nimble's speed), picked from the installed models whose `/api/tags` `capabilities` include `decision`; Nimble offered as the more accurate choice for Macs with 32 GB or more. For TypeSafe, `jev-latest` by default. If the model isn't installed, the status line says `ollama pull tev1:4b`.
- **Address:** Ollama's host, shared with the LLM widget's setting.
- **API key:** TypeSafe's key in `ai-keys.toml`, same place and "set up key" flow as the LLM widget's Anthropic/GreenPT keys - never in the patch.

## Generating the questions with an LLM

Writing good questions and options is the hard part of this kind of model, and a non-technical designer is exactly who'd struggle with it. So the more panel also has a **request** box: the designer writes what they want in plain words, and an LLM writes the question script.

> Turn the lamp on when someone asks for light, dim it if they say they want to relax, and tell me if they sound annoyed.

- **Generate while building the patch, not while it runs.** Clicking *Generate* calls an LLM once, through the LLM widget's provider settings (Anthropic, GreenPT or an Ollama chat model). The patch then runs on the decision model alone, at full speed. Asking an LLM for new questions at run time would bring back the multi-second delay and change what outlets mean under existing cables.
- **The result is the editable script**, shown in the script box, so the designer can read and tweak it. Nothing hidden.
- **The LLM also writes test phrases:** a handful of example inputs, some meant to trigger each answer and some that shouldn't trigger anything. They're listed under the script; clicking one feeds it through Decide and shows the answers and confidence. This checks the logic before a microphone or any hardware is involved, and makes a bad question obvious at once (if "make it cozy" doesn't come out as `dim`, reword the request).
- **NTK checks what the LLM produced** before using it: the script parses; 2-26 choice options, 2-10 score levels; every option named; a `none` option added to choices that lack one; at most four questions (one per outlet); question names unique. A failure is shown as a normal script error, never applied silently.
- **The LLM is asked for the script format directly** (a system prompt with the syntax, the limits and two worked examples), plus the test phrases in a separate marked section, so the reply can be parsed without JSON.
- **Regenerating asks first:** the new script is shown next to the current one, with *Use this* / *Keep mine*. Outlets stay positional, so cables survive either way, but a question moving from out2 to out3 changes what a cable means, so the preview should make that visible.
- **No LLM configured:** the Generate button explains what's missing (same messages as the LLM widget), and hand-writing the script still works.

The same "describe it, AI writes the script, test it" idea could later help write Scene scripts.

## Spike (phase 0)

A few hours, outside NTK, before any widget code - same pattern as the DCC spike (`test/dcc-spike.py` + results written back into the plan). One script, `test/decide-spike.mjs` (Node, plain `fetch`, the way `llmProxy.js` will call it), run from the terminal. Results go in a **Spike results** section below.

**This Mac (checked 2026-11-03):** Ollama 0.40.13 (needs 0.35+, fine), M4 Pro, 24 GB RAM, 176 GB free. No decision model installed yet. Chat models already there for the generator test: `gemma4:12b`, `qwen3.6:27b`, `deepseek-r1:14b`, `qwen3.5:0.8b`.

### What it has to answer

1. **Does it work locally at all?** `ollama pull nimble`, then a `/v1/systemone` request with no `Authorization` header. Does the response match the documented shape (noul with no confidence, string-keyed score legend)?
2. **Is it fast enough to feel live?** Cold start (first request after load), then warm: 1 question vs 4 questions, short vs long text, 20 runs each, median and worst. Target: under 200 ms warm for 4 questions, so auto-send on every transcript change works.
3. **Are the answers good on NTK-style input?** A fixed set of about 30 phrases against the plan's example script (`lights` choice, `upset` yes/no, `mood` score):
   - clear requests ("turn the lights on"), indirect ones ("it's too dark in here", "make it cozy"), and off-topic ones that should come out `none` ("what time is it?");
   - messy speech-to-text transcripts (no punctuation, misheard words, cut off mid-sentence) - what SpeechIn really produces;
   - a few non-English phrases (German, Dutch, Spanish), since SpeechIn supports 63 languages;
   - expected answers written next to each, to count hits and look at confidence on the misses.
   Target: about 90% on clear and indirect requests, and `none` chosen for most off-topic ones.
4. **Is the confidence threshold useful?** Do wrong answers mostly have low confidence (so a threshold filters them), or are they confidently wrong? This decides the default threshold.
5. **Where's the real context limit?** Send growing `state` text until it errors or degrades - settles 8,192 vs 256K.
6. **Can an LLM write the question script?** Give the generator system prompt (syntax, limits, two worked examples) and five plain-language requests (lamp control, mood light, a plant that "complains" when dry, a doorbell that sorts visitors, a toy that reacts to praise or scolding) to a local chat model (`gemma4:12b`, then `qwen3.6:27b`) and to Anthropic. Count: does the reply parse, does it respect the limits, are the questions sensible, and do the generated test phrases come out as the LLM intended when run through Nimble?
7. **Optional, if time:** `nimble-v3` and `tev1:4b` on the same phrase set, for speed vs accuracy; and whether `/api/tags` shows anything that marks a model as a decision model (for the widget's model picker).

### Output

- `test/decide-spike.mjs` with the phrase set and expected answers in the file, printing a table: phrase, expected, got, confidence, ms.
- Spike results written into this plan: latencies, hit rate per phrase group, threshold finding, context limit, generator parse rate per model, and anything that contradicts the docs.
- A go / change / stop call: go as planned, change the design (e.g. drop auto-send if slow, fewer outlets, a different default model), or stop if accuracy on indirect speech is poor.

## Spike results (2026-11-03)

Run on Phil's M4 Pro, 24 GB, Ollama 0.40.13, with `node test/decide-spike.mjs`. **Call: go, with changes** (listed at the end).

### 1. Local works, response as documented

- `POST /v1/systemone` with no `Authorization` header: HTTP 200. Response matches the docs exactly: noul is a bare probability with no `confidence`, score legend and probabilities are keyed `"0"`, `"1"`..., answers in question order. One extra field: `prompt_eval_cached_count`.
- **`/api/tags` and `/api/show` list `"capabilities": ["decision"]`** for decision models, so the model picker can show exactly those.
- Errors are clear and map straight onto the widget's status line: 404 model not pulled; 400 `prompt 0 has 8794 tokens; expected 1–8192 (input is never truncated)`; 413 `text and schema must not exceed 64 KiB`.

### 2. Latency: much slower than the advertised 91 ms

| | Nimble 9B | tev1:4b | tev1:0.8b |
|---|---|---|---|
| 1 question, new text each time | 300 ms | | |
| 3 questions (accuracy run, median) | 673 ms | 375 ms | 76 ms |
| 4 questions, new text | 795 ms | | |
| 4 questions, growing transcript | 790 -> 1,230 ms | | |
| first request after load | 2.8-6.8 s | | |
| memory when loaded | 16-18 GB | | 4.8 GB |

- **Each question is its own prompt**, run one after another: about 170 ms per extra question with Nimble. The 400 error names "prompt 0", and 4 parallel requests take as long as running them in sequence (1.1 s).
- Sending the **same text again is answered from a cache** in 2-6 ms. The first latency run measured that by mistake; only new text counts.
- Ollama's 91 ms was measured on an M5 Max. On this M4 Pro, Nimble takes ~300 ms for one question.
- Nimble takes 16-18 GB loaded, so a 16 GB Mac can't run it, and on 24 GB it can't share memory with a local chat model (the generator test had to run all LLM calls first, then all decisions).

### 3. Accuracy (32 phrases, 61 checked answers, `lights` / `upset` / `mood` script)

| | Nimble | tev1:4b | tev1:0.8b |
|---|---|---|---|
| overall | **93%** | 87% | 62% |
| clear requests (lights) | 6/6 | 6/6 | 6/6 |
| indirect ("make it cozy", "too dark in here") | 7/7 | 7/7 | 2/7 |
| off-topic -> `none` | 3/5 | **5/5** | 2/5 |
| speech-to-text mess ("turn the like son") | 4/5 | 3/5 | 3/5 |
| German / Dutch / Spanish (lights) | 5/5 | 4/5 | 3/5 |
| `mood` score | 7/8 | 4/8 | 3/8 |

- Nimble's misses: "play some jazz" -> dim, "the weather is nice today" -> off, "turn the like son" -> off, "I SAID LIGHTS OFF" scored neutral, not agitated. All but the last had low confidence.
- tev1:0.8b is fast but doesn't understand indirect requests: not good enough to be the default.

### 4. The confidence threshold works

Nimble: right answers had median confidence 0.89, wrong ones 0.40.

| threshold | right answers kept | wrong answers let through |
|---|---|---|
| 0.3 | 56/57 | 3/4 |
| **0.5** | 51/57 | **0/4** |
| 0.7 | 41/57 | 0/4 |

tev1:4b is similar (median 0.86 right, 0.17 wrong). **Default threshold 0.5.**

### 5. Context limit: 8,192 tokens per question

`ollama ps` shows a context of 8,192, and anything longer is rejected (never truncated). ~6,500 words still worked but took 12 s. Speech input is nowhere near that; it only matters if someone wires a long LLM reply in.

### 6. An LLM can write the script

Five plain-language requests per model. Every reply came back in the script format; "as intended" means Nimble gave the answer the LLM's own test phrase expected.

| | scripts that parse | test phrases as intended | time per script |
|---|---|---|---|
| Anthropic (claude-sonnet-5-5) | 5/5 | 49/61 (80%) | 3.2 s |
| qwen3.6:27b | 5/5 | 44/60 (73%) | 15.5 s |
| gemma4:12b | 5/5 | 42/58 (72%) | 6.1 s |

- **Choice and yes/no questions mostly came out as intended. Score questions were the weak spot**, in two ways: Nimble often lands one level off ("strong" vs "intense"), and **a score has no "none"**, so off-topic text still gets a level ("what time is lunch?" -> strength: strong).
- The generated questions were sensible. Anthropic's were the best, e.g. a houseplant `watering: watered | forgot | question | none` instead of a one-option choice.
- The test phrases earned their place: they made every weak question obvious straight away (e.g. gemma's plant `care` score answered "okay" for everything).

### 6b. Second run: generator prompt v2

`GEN_PROMPT=v2` (now the default; `v1` reruns the first prompt) adds to the rules:

- prefer choice and yes/no; use a score only for a real "how much / how strongly";
- scores get 3 or 4 levels, clearly different, and the lowest level also covers input the question doesn't apply to ("none", "not at all");
- every extra question makes the widget slower, so one or two is often enough.

The worked example's score became `none < some < very`. Same five requests; each script was checked with both decision models (`DECIDE_MODELS=nimble,tev1:4b`).

| test phrases as intended | v1 -> Nimble | v2 -> Nimble | v2 -> tev1:4b |
|---|---|---|---|
| Anthropic | 49/61 (80%) | **54/62 (87%)** | 53/62 (85%) |
| gemma4:12b | 42/58 (72%) | 43/55 (78%) | 42/55 (76%) |
| qwen3.6:27b | 44/60 (73%) | 40/59 (68%) | 37/59 (63%) |

- **It helped where it was meant to.** Scores dropped from 6 of 15 scripts to 3. Anthropic's toy script (`strength: score none < mild < medium < strong`) got every praise and scold phrase right, against 1 of 8 in v1. gemma folded its mood light into one question.
- **qwen got worse.** One of its scripts wrote `score none < low | med | high`, which the parser wrongly accepted as two levels; it now rejects `|` in a score and `<` in a choice. Its other misses are question wording, not format.
- **tev1:4b is only 1-2 points behind Nimble on generated scripts**, closer than on the hand-written phrase set. That supports it as the default.
- **The main remaining error: off-topic text still moves yes/no and score questions.** "What time is it?" comes out `urgent: yes`, `caring: yes`, `strength: medium`, even when the first choice question correctly says `none`. The prompt can't fix this: a yes/no question can't answer "doesn't apply". With Nimble, 10 of the v2 misses were on phrases where the first choice correctly said `none`; tev1:4b leans towards no/lowest on off-topic text, so only 2 of its misses were.
- Generation times were the same as the first run (Anthropic ~3 s, gemma ~6 s, qwen ~14 s).

**Design consequence: a "gate" rule.** When the first question is a choice and it answers `none` (above the threshold), the other outlets hold their values. Make this the default, shown in the more panel, and tell the generator about it, so it puts the on-topic choice first. Counting those Nimble misses as held, v2 -> Nimble would reach about 84% across all three generators, against 78% now.

### 7. Other models

`tev1:4b` and `tev1:0.8b` are compared in the tables above. `nimble-v3` wasn't tried.

### Changes to the design

1. **Auto-send must not fire on every partial transcript.** At 0.3-1.2 s a request, send only the final transcript (SpeechIn's end of speech) or after a longer pause (~400 ms), with at most one request in flight; text arriving meanwhile replaces whatever is waiting. The status line's ms readout becomes important.
2. **Fewer questions is faster.** Each question adds ~170 ms (Nimble). The generator prompt should say so, and the widget could show the expected time.
3. **Default model: tev1:4b** (Phil, 2026-11-03). It's twice as fast as Nimble, fits a 16 GB Mac and got every off-topic phrase right, but misses more on score questions and messy speech. Nimble (most accurate, ~18 GB) is the documented upgrade.
4. **Steer the generator towards choice and yes/no**, with 3-4 score levels whose lowest covers "doesn't apply" (prompt v2, tested in 6b). **Gate rule:** when the first question is a choice answering `none`, the other outlets hold, so off-topic talk doesn't move a yes/no or score; on by default, and the generator puts the on-topic choice first.
5. **Warm-up matters:** the first request is 3-7 s. Load the model when the widget is activated (as the LLM widget does), with `keep_alive`.
6. Model picker: filter `/api/tags` on `capabilities` containing `decision`.

## Implementation notes

- **Calls go through `server/llmProxy.js`**, like every LLM widget call: a new `ipcMain.handle('decide', ...)` doing a plain `fetch` to `{base}/v1/systemone`, adding the bearer key for TypeSafe. Keeps the API key out of the renderer and the patch, and gives one code path for both providers. Cancel support like `llm-cancel` for the latest-wins behaviour.
- **No SDK.** TypeSafe has a Python SDK (`typesafe-sdk`) and a JavaScript one (`@typesafe-ai/sdk` 0.7.0, Node 22+), and Ollama's page suggests pointing the SDK at Ollama with `TYPESAFE_BASE_URL`. But TypeSafe's own docs never mention Ollama, the JS SDK's docs show no base-URL option, and both require an API key a local Ollama doesn't need. The API is one small JSON request and response, so plain `fetch` is simpler and adds no dependency.
- **Warm-up:** Ollama loads a model on first use (seconds for 9 GB). Send a tiny request when the widget is switched on, as the LLM widget does with `llm-warm`, and set `keep_alive` so it stays loaded.
- **Script parser** in its own module (like `SceneScript.js`), with shared test cases in `test/` - parse, limits, `none` insertion, request building.
- **Rivets/Backbone gotchas** from CLAUDE.md apply: register custom binders before the base `onRender`, and act on the text inlet only when its value changes (the nested-set repeat).
- **Not standalone:** decision models need Ollama or the internet, so Decide is a host-only widget like the other AI widgets. Push to Device reports it as unsupported.

## Uses to show in docs and examples

- Voice control: SpeechIn → Decide (`lights: choice on | off | dim | none`) → IfThen / DigitalOut / AnalogOut.
- Mood light: SpeechIn → Decide (`mood: score calm < neutral < agitated`) → NeoPixel colour.
- Routing: Decide picks which of several LLM widgets (personalities) answers a question.
- Moderation: an LLM reply goes through Decide (`ok: yes/no Is this suitable for a child?`) before SpeechOut speaks it.
- Object reactions: ObjectRecog's label + "is it evening?" → Decide → Scene start.

## Open questions

- Four outlets, or fewer outlets plus a confidence outlet?
- Should a choice outlet send the option name, its index, or both (two outlets per question would halve the question count)?
- Does `nimble-v3` change the API, speed or limits? Not tried in the spike.
- Settled: default model `tev1:4b` (Nimble as the accurate option); no `Authorization` header needed locally; context is 8,192 tokens per question; German, Dutch and Spanish work with Nimble (5/5).

## Not planned

- Image input (Jev's `box`/image preview) - possible later with ObjectRecog/camera widgets.
- Questions generated at run time.
- Chaining questions inside one widget (one answer feeding the next request): wire two Decide widgets instead.
