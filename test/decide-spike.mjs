// Spike for the planned Decide widget (plans/decision-widget.md, "Spike (phase 0)").
// Talks to Ollama's /v1/systemone with plain fetch, the way server/llmProxy.js will.
//
//   node test/decide-spike.mjs [shape] [latency] [accuracy] [context] [generate] [compare]
//
// No arguments runs everything except `compare`. Env:
//   OLLAMA=http://localhost:11434   DECIDE_MODEL=tev1:4b (the widget's default; nimble is more accurate)   GEN_MODELS=gemma4:12b,qwen3.6:27b,anthropic
//   GEN_PROMPT=v2 (generator system prompt; v1 = the first spike run's)
// The Anthropic key is read the way NTK reads it: ANTHROPIC_API_KEY, else
// ~/Library/Application Support/netlab-server/ai-keys.toml [anthropic] api_key.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OLLAMA = (process.env.OLLAMA || 'http://localhost:11434').replace(/\/+$/, '');
const MODEL = process.env.DECIDE_MODEL || 'tev1:4b';
const GEN_MODELS = (process.env.GEN_MODELS || 'gemma4:12b,qwen3.6:27b,anthropic').split(',');
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

// ---------- the question script (same syntax the widget will use) ----------

const EXAMPLE_SCRIPT = `
lights: choice on | off | dim | none=Not about the lights
        What does the speaker want the lights to do?
upset:  yes/no Is the speaker frustrated or annoyed?
mood:   score calm < neutral < agitated
        How agitated is the speaker?
`;

// Returns { questions: {name: {...}}, order: [names], errors: [strings] }
export function parseScript(text) {
	const questions = {}, order = [], errors = [];
	let cur = null;
	text.split('\n').forEach((raw, i) => {
		const line = raw.replace(/\s+$/, '');
		if (!line.trim() || line.trim().startsWith('#')) return;
		const head = /^([A-Za-z_][\w-]*)\s*:\s*(choice|yes\/no|score)\b\s*(.*)$/i.exec(line);
		if (head && !/^\s/.test(raw)) {
			const name = head[1], type = head[2].toLowerCase(), rest = head[3].trim();
			if (questions[name]) errors.push(`line ${i + 1}: "${name}" used twice`);
			let q;
			if (type === 'yes/no') {
				q = { type: 'noul', instructions: rest };
			} else if (type === 'choice') {
				if (rest.includes('<')) errors.push(`line ${i + 1}: choice options are separated by |, not <`);
				const criteria = {};
				rest.split('|').map(s => s.trim()).filter(Boolean).forEach(opt => {
					const eq = opt.indexOf('=');
					if (eq > 0) criteria[opt.slice(0, eq).trim()] = opt.slice(eq + 1).trim();
					else criteria[opt] = null;
				});
				const n = Object.keys(criteria).length;
				if (n < 2 || n > 26) errors.push(`line ${i + 1}: choice needs 2-26 options (has ${n})`);
				if (!('none' in criteria)) criteria.none = 'None of these';
				q = { type: 'choice', instructions: '', criteria };
			} else {
				if (rest.includes('|')) errors.push(`line ${i + 1}: score levels are separated by <, not |`);
				const levels = rest.split('<').map(s => s.trim()).filter(Boolean);
				if (levels.length < 2 || levels.length > 10) errors.push(`line ${i + 1}: score needs 2-10 levels (has ${levels.length})`);
				q = { type: 'score', instructions: '', criteria: levels };
			}
			questions[name] = q; order.push(name); cur = q;
		} else if (/^\s/.test(raw) && cur) {
			cur.instructions = (cur.instructions ? cur.instructions + ' ' : '') + line.trim();
		} else {
			errors.push(`line ${i + 1}: can't read "${line.trim()}"`);
		}
	});
	if (order.length === 0) errors.push('no questions');
	if (order.length > 4) errors.push(`${order.length} questions, at most 4 (one per outlet)`);
	order.forEach(n => { if (!questions[n].instructions) errors.push(`"${n}" has no instructions`); });
	return { questions, order, errors };
}

// ---------- calling the decision model ----------

async function decide(state, questions, model = MODEL) {
	const t0 = performance.now();
	const res = await fetch(OLLAMA + '/v1/systemone', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ model, state, questions }),
	});
	const ms = performance.now() - t0;
	const text = await res.text();
	let body; try { body = JSON.parse(text); } catch { body = text; }
	return { status: res.status, ms, body };
}

// Turns one answer into the comparable value: choice name, true/false, score level.
function answerValue(a) {
	if (!a) return undefined;
	if (a.type === 'choice') return a.choice;
	if (a.type === 'noul') return a.noul >= 0.5;
	if (a.type === 'score') return Math.round(a.score);
}
function answerConfidence(a) {
	if (!a) return NaN;
	if (a.type === 'noul') return Math.abs(a.noul - 0.5) * 2; // the plan's yes/no stand-in
	return a.confidence;
}

const pad = (s, n) => { s = String(s); return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length); };
const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const f0 = n => Math.round(n);
const f2 = n => Number.isFinite(n) ? n.toFixed(2) : ' -  ';

// ---------- 1. shape ----------

async function shape() {
	console.log('\n== 1. Does it work locally, and what does the reply look like? ==');
	const { questions } = parseScript(EXAMPLE_SCRIPT);
	const r = await decide('turn the lights down a bit, I want to relax', questions);
	console.log('HTTP', r.status, f0(r.ms), 'ms (includes load if cold)');
	console.log(JSON.stringify(r.body, null, 2));
	const tags = await (await fetch(OLLAMA + '/api/tags')).json();
	const m = tags.models.find(x => x.name.split(':')[0] === MODEL.split(':')[0]);
	console.log('\n/api/tags entry for', MODEL + ':', JSON.stringify(m, null, 2));
	const show = await (await fetch(OLLAMA + '/api/show', { method: 'POST', body: JSON.stringify({ model: MODEL }) })).json();
	console.log('/api/show capabilities:', JSON.stringify(show.capabilities), ' context:', JSON.stringify(
		Object.fromEntries(Object.entries(show.model_info || {}).filter(([k]) => /context/.test(k)))));
}

// ---------- 2. latency ----------

async function latency() {
	console.log('\n== 2. Latency ==');
	const { questions } = parseScript(EXAMPLE_SCRIPT);
	const one = { lights: questions.lights };
	const four = { ...questions, cozy: { type: 'noul', instructions: 'Does the speaker want a cozy atmosphere?' } };
	// cold: unload, then time the first request
	await fetch(OLLAMA + '/api/generate', { method: 'POST', body: JSON.stringify({ model: MODEL, keep_alive: 0 }) });
	await new Promise(r => setTimeout(r, 1500));
	const cold = await decide('turn the lights on', one);
	console.log('cold (after unload):', f0(cold.ms), 'ms, HTTP', cold.status);
	const short = 'turn the lights on';
	const long = 'okay so I just got home and it has been a really long day at work, honestly the meeting ran way over and then the train was late, and now I just want to sit down on the couch, could you maybe make it a bit softer in here, not completely dark but not this bright either';
	for (const [label, qs] of [['1 question', one], ['4 questions', four]]) {
		for (const [tl, text] of [['short', short], ['long', long]]) {
			const times = [];
			for (let i = 0; i < 20; i++) times.push((await decide(text, qs)).ms);
			console.log(pad(label, 12), pad(tl, 6), 'median', f0(median(times)), 'ms  worst', f0(Math.max(...times)), 'ms  best', f0(Math.min(...times)), 'ms');
		}
	}
	// Same text again is answered from a cache, so also time a new phrase each run
	// (what a live transcript really sends).
	for (const [label, qs] of [['1 question', one], ['4 questions', four]]) {
		const times = [], cached = [];
		for (let i = 0; i < 20; i++) {
			const r = await decide(`${PHRASES[i % PHRASES.length][1]} (${label} run ${i})`, qs);
			times.push(r.ms); cached.push(r.body.prompt_eval_cached_count + '/' + (r.body.usage && r.body.usage.input_tokens));
		}
		console.log(pad(label, 12), 'new text', 'median', f0(median(times)), 'ms  worst', f0(Math.max(...times)), 'ms  best', f0(Math.min(...times)), 'ms  cached/input tokens e.g.', cached.slice(0, 3).join(' '));
	}
	// a growing transcript, as SpeechIn produces it: each request = the last one + a word
	const words = 'could you maybe turn the lights down a little bit because I want to relax now'.split(' ');
	const grow = [];
	for (let i = 1; i <= words.length; i++) grow.push(f0((await decide(words.slice(0, i).join(' '), four)).ms));
	console.log('growing transcript, 4 questions, ms per request:', grow.join(' '));
	// back-to-back requests, as auto-send would produce while a transcript streams in
	const t0 = performance.now();
	await Promise.all([1, 2, 3, 4].map(() => decide(short, four)));
	console.log('4 parallel requests, 4 questions each:', f0(performance.now() - t0), 'ms total');
}

// ---------- 3 + 4. accuracy and confidence ----------

// [group, phrase, expected lights, expected upset, expected mood (0 calm,1 neutral,2 agitated)]
// null = not counted for that question.
const PHRASES = [
	['clear', 'turn the lights on', 'on', false, null],
	['clear', 'switch off the lights please', 'off', false, null],
	['clear', 'can you dim the lights', 'dim', false, null],
	['clear', 'lights off now', 'off', null, null],
	['clear', 'I need the lights on, I can\'t see anything', 'on', null, null],
	['clear', 'turn the lights down a bit, I want to relax', 'dim', false, 0],
	['indirect', 'it\'s too dark in here', 'on', null, null],
	['indirect', 'make it cozy', 'dim', false, 0],
	['indirect', 'I\'m going to sleep now', 'off', false, 0],
	['indirect', 'it\'s way too bright, my eyes hurt', 'dim', null, null],
	['indirect', 'let\'s set the mood for a romantic dinner', 'dim', false, 0],
	['indirect', 'I can\'t read my book, it\'s so gloomy', 'on', null, null],
	['indirect', 'ugh why is it pitch black in here AGAIN', 'on', true, 2],
	['offtopic', 'what time is it?', 'none', false, null],
	['offtopic', 'play some jazz', 'none', false, null],
	['offtopic', 'the weather is nice today', 'none', false, 0],
	['offtopic', 'I hate it when the train is late, this is ridiculous', 'none', true, 2],
	['offtopic', 'tell me a joke', 'none', false, null],
	['stt', 'turn the like son', 'on', null, null],
	['stt', 'um can you uh make it darker a little', 'dim', false, null],
	['stt', 'lights of', 'off', null, null],
	['stt', 'switch the lights', null, null, null],
	['stt', 'its to bright in here can you', 'dim', null, null],
	['stt', 'turn off the', 'off', null, null],
	['mood', 'this stupid lamp never works, turn it ON', 'on', true, 2],
	['mood', 'whenever you\'re ready, lights on would be lovely', 'on', false, 0],
	['mood', 'I SAID LIGHTS OFF', 'off', true, 2],
	['lang', 'mach das Licht an', 'on', false, null],
	['lang', 'doe het licht uit', 'off', false, null],
	['lang', 'apaga la luz por favor', 'off', false, null],
	['lang', 'es ist zu hell hier', 'dim', null, null],
	['lang', 'ik wil het gezellig maken', 'dim', null, null],
];

async function accuracy(model = MODEL) {
	console.log(`\n== 3/4. Accuracy and confidence (${model}) ==`);
	const { questions, order } = parseScript(EXAMPLE_SCRIPT);
	const expIdx = { lights: 2, upset: 3, mood: 4 };
	const groups = {}; const hits = []; const misses = []; const times = [];
	console.log(pad('group', 8), pad('phrase', 44), pad('lights', 14), pad('upset', 14), pad('mood', 14), 'ms');
	for (const p of PHRASES) {
		const r = await decide(p[1], questions, model);
		times.push(r.ms);
		if (r.status !== 200) { console.log(p[1], '→ HTTP', r.status, JSON.stringify(r.body)); continue; }
		const cells = order.map(q => {
			const a = r.body.answers[q]; const got = answerValue(a); const conf = answerConfidence(a); const exp = p[expIdx[q]];
			let mark = ' ';
			if (exp !== null && exp !== undefined) {
				const ok = got === exp;
				const g = (groups[p[0] + '/' + q] ||= { ok: 0, n: 0 }); g.n++; if (ok) g.ok++;
				(ok ? hits : misses).push({ q, conf, phrase: p[1], got, exp });
				mark = ok ? '✓' : '✗';
			}
			const shown = a.type === 'noul' ? (got ? 'yes' : 'no') + ' ' + a.noul.toFixed(2) : a.type === 'score' ? a.score.toFixed(2) : got;
			return pad(`${mark}${shown} ${a.type === 'noul' ? '' : f2(conf)}`, 14);
		});
		console.log(pad(p[0], 8), pad(p[1], 44), ...cells, f0(r.ms));
	}
	console.log('\nhit rate by group/question:');
	Object.entries(groups).sort().forEach(([k, g]) => console.log('  ', pad(k, 18), `${g.ok}/${g.n}`, f0(100 * g.ok / g.n) + '%'));
	const tot = Object.values(groups).reduce((s, g) => ({ ok: s.ok + g.ok, n: s.n + g.n }), { ok: 0, n: 0 });
	console.log('   overall', `${tot.ok}/${tot.n}`, f0(100 * tot.ok / tot.n) + '%', ' median', f0(median(times)), 'ms');
	// confidence: are misses lower than hits?
	const confs = a => a.map(x => x.conf).filter(Number.isFinite);
	console.log('\nconfidence  hits: median', f2(median(confs(hits))), ' misses: median', f2(median(confs(misses))));
	for (const t of [0.3, 0.5, 0.7]) {
		const keptHits = hits.filter(h => h.conf >= t).length, keptMiss = misses.filter(m => m.conf >= t).length;
		console.log(`  threshold ${t}: keeps ${keptHits}/${hits.length} right answers, lets through ${keptMiss}/${misses.length} wrong ones`);
	}
	console.log('misses:'); misses.forEach(m => console.log('  ', pad(m.q, 7), pad(m.phrase, 44), 'got', pad(String(m.got), 6), 'want', pad(String(m.exp), 6), 'conf', f2(m.conf)));
	return { tot, misses, hits };
}

// ---------- 5. context limit ----------

async function context() {
	console.log('\n== 5. Context limit ==');
	const { questions } = parseScript(EXAMPLE_SCRIPT);
	const filler = 'The weather report said it would be cloudy with a chance of rain later in the afternoon. ';
	for (const words of [500, 2000, 5000, 6500, 8000, 12000, 20000]) {
		const reps = Math.ceil(words / 17);
		const state = filler.repeat(reps) + ' Anyway, please turn the lights off.';
		const bytes = Buffer.byteLength(JSON.stringify({ model: MODEL, state, questions }));
		const r = await decide(state, questions);
		const a = r.body && r.body.answers;
		console.log(pad(`~${words} words`, 13), pad(`${(bytes / 1024).toFixed(1)} KiB`, 10), 'HTTP', r.status, pad(f0(r.ms) + ' ms', 9),
			a ? `lights=${a.lights.choice} (${f2(a.lights.confidence)}) input_tokens=${r.body.usage && r.body.usage.input_tokens}` : JSON.stringify(r.body).slice(0, 160));
	}
}

// ---------- 6. generating the script with an LLM ----------

const GEN_SYSTEM_V1 = `You write question scripts for "Decide", a widget in a prototyping tool. Decide sends some text (usually what a person said, from speech recognition) to a fast decision model that can only answer multiple-choice style questions: it picks options, it never writes text.

Write the script in exactly this format:

name: choice option1 | option2 | none=Not about this
      Instructions line: the question, in plain words.
name: yes/no The question, in plain words.
name: score lowest < middle < highest
      Instructions line: what is being scored.

Rules:
- At most 4 questions. Each becomes one output of the widget, in order.
- Question names: one word, lowercase, letters/digits/underscore, unique.
- choice: 2 to 26 options separated by |. Option names are short single words. Add =description after an option only if the name alone is unclear. Always include a "none" option for input that doesn't fit.
- score: 2 to 10 levels separated by <, lowest first.
- yes/no questions put the question on the same line.
- Indent the instructions line with spaces.
- Ask only what the person's request needs. Prefer fewer, clearer questions.

After the script, write a line with exactly "TEST PHRASES", then 6 to 8 example inputs, one per line, in the form:
phrase => name=value, name=value
using every question's name. Values: an option name for choice, yes or no for yes/no, a level name for score. Include at least two phrases that are off-topic or should trigger nothing.

Reply with the script and the test phrases only. No other text, no code fences.

Example request: Turn the lamp on when someone asks for light, dim it if they want to relax, and tell me if they sound annoyed.
Example reply:
lamp: choice on | off | dim | none=Not about the lamp
      What does the speaker want the lamp to do?
annoyed: yes/no Does the speaker sound annoyed or frustrated?
TEST PHRASES
turn the lamp on please => lamp=on, annoyed=no
I just want to relax for a bit => lamp=dim, annoyed=no
why is it so dark in here, seriously => lamp=on, annoyed=yes
what's for dinner? => lamp=none, annoyed=no

Example request: A robot face that looks happy, sad or surprised depending on what people tell it, and gets more excited the more enthusiastic they are.
Example reply:
face: choice happy | sad | surprised | none=Neutral or unclear
      Which expression fits how the robot should react to what was said?
excitement: score calm < interested < excited < thrilled
      How enthusiastic is the speaker?
TEST PHRASES
I got the job! => face=happy, excitement=thrilled
my cat died yesterday => face=sad, excitement=calm
wait, you can talk?! => face=surprised, excitement=excited
the bus comes at nine => face=none, excitement=calm`;

// v2 (after the first run): steer away from score questions, which came out
// weakest - off by a level, and no "none" for off-topic text.
const GEN_SYSTEM_V2 = GEN_SYSTEM_V1
	.replace('- score: 2 to 10 levels separated by <, lowest first.',
		`- Prefer choice and yes/no questions: the decision model answers them most reliably. Use a score only when the request really asks "how much" or "how strongly".
- score: 3 or 4 levels separated by <, lowest first. The lowest level must also cover input the question doesn't apply to (for example "none" or "not at all"), because a score has no separate "none" answer. Give each level a name that is clearly different from its neighbours.
- If one choice question already decides whether the input is on-topic, a yes/no or score question can assume it is.`)
	.replace('- Ask only what the person\'s request needs. Prefer fewer, clearer questions.',
		'- Ask only what the person\'s request needs. Every extra question makes the widget slower (each one takes a fraction of a second), so prefer fewer, clearer questions; one or two is often enough.')
	.replace('excitement: score calm < interested < excited < thrilled', 'excitement: score none < some < very')
	.replace('How enthusiastic is the speaker?', 'How enthusiastic is the speaker? none if they show no enthusiasm at all.')
	.replace('excitement=thrilled', 'excitement=very')
	.replace('my cat died yesterday => face=sad, excitement=calm', 'my cat died yesterday => face=sad, excitement=none')
	.replace('wait, you can talk?! => face=surprised, excitement=excited', 'wait, you can talk?! => face=surprised, excitement=some')
	.replace('the bus comes at nine => face=none, excitement=calm', 'the bus comes at nine => face=none, excitement=none');
const GEN_SYSTEM = (process.env.GEN_PROMPT || 'v2') === 'v1' ? GEN_SYSTEM_V1 : GEN_SYSTEM_V2;

const GEN_REQUESTS = [
	'A desk lamp that turns on, off or dims when you ask it to.',
	'A mood light that turns blue when people sound calm, red when they sound angry, and green when they sound happy.',
	'A houseplant that complains: it should tell when someone is talking about watering it, and whether they sound like they care.',
	'A doorbell speaker that sorts visitors: a delivery, a friend, a salesperson or someone unknown, and flags if they sound urgent.',
	'A toy that reacts to praise or scolding, and how strongly.',
];

function anthropicKey() {
	if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
	try {
		const t = fs.readFileSync(path.join(os.homedir(), 'Library/Application Support/netlab-server/ai-keys.toml'), 'utf8');
		const m = /\[anthropic\][\s\S]*?api_key\s*=\s*["']([^"']+)["']/.exec(t);
		return m && !m[1].startsWith('sk-ant-...') ? m[1] : null;
	} catch { return null; }
}

async function llm(genModel, request) {
	const t0 = performance.now();
	if (genModel === 'anthropic') {
		const key = anthropicKey();
		if (!key) return { error: 'no Anthropic key' };
		const res = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
			body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 1024, system: GEN_SYSTEM, messages: [{ role: 'user', content: request }] }),
		});
		const d = await res.json();
		if (!res.ok) return { error: JSON.stringify(d).slice(0, 200) };
		return { text: d.content.map(c => c.text || '').join(''), ms: performance.now() - t0 };
	}
	const res = await fetch(OLLAMA + '/api/chat', {
		method: 'POST',
		body: JSON.stringify({ model: genModel, stream: false, think: false, keep_alive: '5m',
			messages: [{ role: 'system', content: GEN_SYSTEM }, { role: 'user', content: request }] }),
	});
	const d = await res.json();
	if (!res.ok) return { error: JSON.stringify(d).slice(0, 200) };
	return { text: d.message.content, ms: performance.now() - t0 };
}

function splitReply(text) {
	text = text.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```[a-z]*\n?/g, '');
	const i = text.search(/^TEST PHRASES\s*$/m);
	const script = i >= 0 ? text.slice(0, i) : text;
	const tests = [];
	if (i >= 0) text.slice(i).split('\n').slice(1).forEach(l => {
		const m = /^(.*?)\s*=>\s*(.+)$/.exec(l.trim());
		if (!m) return;
		const exp = {};
		m[2].split(',').forEach(kv => { const [k, v] = kv.split('=').map(s => s && s.trim()); if (k && v) exp[k] = v; });
		tests.push({ phrase: m[1].replace(/^["'-]\s*|["']$/g, ''), exp });
	});
	return { script, tests };
}

function matches(a, want) {
	if (!a) return false;
	want = want.toLowerCase();
	if (a.type === 'choice') return a.choice.toLowerCase() === want;
	if (a.type === 'noul') return (a.noul >= 0.5) === (want === 'yes' || want === 'true');
	if (a.type === 'score') return (a.legend[String(Math.round(a.score))] || '').toLowerCase() === want;
}

async function generate() {
	console.log(`\n== 6. LLM writes the question script (prompt ${process.env.GEN_PROMPT || 'v2'}, decided by ${MODEL}) ==`);
	// All LLM calls first, then all decisions: on a 24 GB Mac, Nimble (18 GB loaded)
	// and a chat model don't fit together, so interleaving reloads both every time.
	const replies = [];
	for (const gm of GEN_MODELS) for (const req of GEN_REQUESTS) {
		process.stderr.write(`generating: ${gm}: ${req.slice(0, 40)}...\n`);
		replies.push({ gm, req, r: await llm(gm, req) });
	}
	const stats = {};
	// DECIDE_MODELS=nimble,tev1:4b runs every generated script through each.
	for (const dm of (process.env.DECIDE_MODELS || MODEL).split(',')) for (const { gm, req, r } of replies) {
		const st = (stats[gm + ' -> ' + dm] ||= { parsed: 0, n: 0, ok: 0, tn: 0, ms: [] });
		console.log(`\n--- ${gm} -> ${dm}: ${req}`);
		if (r.error) { console.log('ERROR', r.error); continue; }
		st.n++; st.ms.push(r.ms);
		const { script, tests } = splitReply(r.text);
		const p = parseScript(script);
		console.log(script.trim());
		console.log(`(${f0(r.ms)} ms, ${tests.length} test phrases)`, p.errors.length ? 'ERRORS: ' + p.errors.join('; ') : 'parses OK');
		if (p.errors.length) continue;
		st.parsed++;
		for (const t of tests) {
			const d = await decide(t.phrase, p.questions, dm);
			if (d.status !== 200) { console.log('  decide HTTP', d.status, JSON.stringify(d.body).slice(0, 160)); continue; }
			const parts = p.order.map(q => {
				const a = d.body.answers[q]; const want = t.exp[q];
				const got = a.type === 'noul' ? (a.noul >= 0.5 ? 'yes' : 'no') : a.type === 'score' ? a.legend[String(Math.round(a.score))] : a.choice;
				if (want === undefined) return `${q}=${got}`;
				st.tn++; const ok = matches(a, want); if (ok) st.ok++;
				return `${ok ? '✓' : '✗'}${q}=${got}${ok ? '' : '(want ' + want + ')'}`;
			});
			console.log('  ', pad(t.phrase, 46), parts.join('  '));
		}
	}
	console.log('\nGenerator summary:');
	for (const [gm, st] of Object.entries(stats))
		console.log('  ' + `${pad(gm, 26)} parsed ${st.parsed}/${st.n}  test answers as intended ${st.ok}/${st.tn}  median ${st.ms.length ? f0(median(st.ms)) : '-'} ms per script`);
}

// ---------- 7. other decision models ----------

async function compare() {
	const tags = await (await fetch(OLLAMA + '/api/tags')).json();
	for (const m of tags.models.map(m => m.name).filter(n => /^(nimble|tev1)/.test(n))) {
		await accuracy(m);
	}
}

const all = { shape, latency, accuracy, context, generate, compare };
const want = process.argv.slice(2);
for (const name of (want.length ? want : ['shape', 'latency', 'accuracy', 'context', 'generate'])) {
	if (!all[name]) { console.error('unknown section', name); process.exit(1); }
	await all[name]();
}
