# Grid observer: patches as digital twins of a community of things

**Status:** blue-sky brainstorm (2026-11-12). Nothing scoped or built.
Captures a conversation, not a design.

Starting point: a patch running live (especially with **Monitor
Device**, where the board runs the patch standalone and NTK mirrors its
values) is already a small digital twin. An LLM watching it could
recognise patterns in the live data and say in plain language what's
going on. The blue-sky version: a community's connected energy, water
and waste systems, with an observer that summarises what's happening
and makes recommendations.

## Sources

Loosely based on two Cities of Things pages:

- **[The Grid 2033](https://citiesofthings.nl/the-grid-2033/)** - a
  speculative story set in a residential building (loosely inspired by
  De Warren and Schoon Schip, Amsterdam). Energy decisions use
  **quadratic voting**, and non-human actors "play an active, initiating
  role in putting forward viewpoints and supporting arguments". Objects
  run **edge AI (small language models) on a mesh network** and form a
  "**shadow mini-society**" that negotiates and makes some autonomous
  choices toward collective goals. A new resident, Lena, connects with
  everyday objects through **digital twins and simulated scenarios**.
  Humans and things meet quarterly to reflect on goals and practice.
- **[Cities of Things manifesto](https://citiesofthings.nl/about/cities-of-things-manifesto/)**
  (2026, "Manifesto for Immersive AI") - ten principles for physical,
  agentic AI in lived space:
  - *Legibility:* legibility of agency (that a thing acted, why, "on
    whose behalf, and from whose perspective"); predictive symmetry;
    assemblage transparency (coordination between things is
    perceptible, its boundaries knowable).
  - *Humble:* peripheral presence (centre of attention only when
    invited or for safety); relational integrity (relations not
    "predetermined by external optimisation"; protect human-to-human
    relations).
  - *Honesty:* friction (keep resistance, surprise, unoptimised
    experience); temporal honesty (don't simulate relational depth that
    hasn't been earned).
  - *Community:* democratic precedence (governance before technology);
    distributed sovereignty (collective governance/ownership of data,
    models, compute).
  - *Openness:* open up to build back (people add and modify their own
    agentic things).

## Two technical constraints

- **LLMs are poor at raw numeric time series** (drift, periodicity,
  correlation) and too slow/costly to watch fast signals. Use two
  layers: plain code turns signals into events and summaries ("rose
  from 200 to 800 in 3 s", "flat for 5 min", "input changed but the
  servo didn't move", "these two move together"); the LLM reads the
  event log *plus the patch graph*, which tells it what each signal
  means.
- **No special graph model needed.** A patch (`.ntk` = `widgets` +
  `mappings`) is a small graph; a compact text serialisation (nodes,
  key settings, `A.out1 -> B.in` edges, live values) fits one prompt.
  `utils/StandaloneCompatibility.js` already walks a patch structurally.

## How the sources reshape the idea

- **Many voices plus a translator, not one central observer.** Each
  system (battery, water tank, heat pump) is an agent with its own
  perspective. The observer doesn't decide from above; it makes the
  negotiation legible: what was argued, agreed, who gave way, why -
  assemblage transparency as a feature.
- **Recommendations become proposals in a democratic process.** Things
  put viewpoints forward, people vote, the observer explains the
  trade-offs. Not an optimiser telling people what to do.
- **The twin is for "what if", not only "what's happening".** Let
  residents try a decision in simulation before voting.
- **Peripheral by default.** Summaries when asked, or at the "quarterly
  meeting", not constant narration.

## How NTK could prototype it

NTK wouldn't run real infrastructure; it could prototype the
*experience* of one, with stand-in hardware or none.

| The Grid | NTK |
|---|---|
| Things with a perspective, small local models | An LLM widget per thing, with a persona; LLM already supports Ollama. The [Pi port](raspberry-pi-port.md) would put a local model in the object |
| Mesh network | Generic MQTT ([cloud widgets](cloud-widgets.md)) so separate NTKs/boards share a channel |
| Negotiation, then a decision | Things post positions; a new **Vote** widget (quadratic voting) for the people in a test |
| Autonomous action | Standalone patches; [start/done](control-flow.md) to chain actions |
| Digital twin, simulated scenarios | The patch running on recorded or simulated data, faster than real time - "test without hardware" extended to "test without a community" |
| Legibility | An observer/narrator: SpeechOut, a display, a periodic summary |

Possible NTK pieces, smallest first:

1. **Explain patch** (no new widget): serialise the open patch +
   live values, send through `server/llmProxy.js`, show the answer.
   Try first by asking Claude Code to read `server/currentPatch.ntk`.
2. **Event layer**: code that turns live values into an event log.
3. **Observer widget**: like Decide, but over the whole patch's events;
   patterns written in plain language in the more panel, one outlet per
   pattern, pulsing 1023 when recognised (so it can start a Scene or
   SpeechOut). Fits beside Gesture (trained by example) and Decide
   (meaning of text).
4. **Vote widget** and per-thing personas over MQTT, for a Grid-style
   study.

## Tensions / open questions

1. Where's the line between a thing "putting forward viewpoints" and
   manipulating? Does temporal honesty argue against giving a battery a
   personality at all?
2. Who wrote each thing's goals? If the manufacturer did, distributed
   sovereignty fails before the first vote. Can residents edit a
   thing's values (part of "open to build back")?
3. Does the observer become the most powerful actor, since it decides
   what residents hear? Several summaries from different perspectives,
   or access to the raw arguments?
4. When it's wrong, how does anyone find out, and who's accountable
   for a followed recommendation that caused harm?
5. Act or only recommend - where's the line, and would residents draw
   it in the same place?
6. Efficiency, or making infrastructure visible to the people who
   depend on it? They lead to different designs.
7. Reaction time: anything that must respond in under a second can't
   wait for an LLM - Gesture-style trained recognition or rules there.
8. Privacy: household energy/water data reveals when people are home;
   neighbourhood-level summaries may need to be a design rule.
9. Smallest study that teaches something a speculative film can't: e.g.
   three objects in a shared kitchen, each with a persona and a goal,
   real people voting over a week.
