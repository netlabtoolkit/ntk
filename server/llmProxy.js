'use strict';

// LLM proxy for the LLM widget. Runs in the Electron main process:
// keeps API keys out of the renderer and the saved patch, and avoids
// browser CORS. Wired up from electronApp.js; exposed to the renderer
// through preload.js's contextBridge as window.ntkElectron.llm*.
//
// Providers: Anthropic (cloud, needs a key), GreenPT (cloud, needs a
// key - an OpenAI-compatible API, see docs.greenpt.ai) and Ollama
// (local, no key). Node 22 in the main process has global fetch - no
// HTTP dep.

const fs = require('fs');
const path = require('path');
const { ipcMain, shell, app } = require('electron');

const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_ANTHROPIC_BASE = 'https://api.anthropic.com';
const DEFAULT_OLLAMA_BASE = 'http://localhost:11434';
// GreenPT's EU endpoint; includes the /v1 the OpenAI-style paths hang
// off, so a base_url override must too (the US one is
// https://api.us.greenpt.ai/v1).
const DEFAULT_GREENPT_BASE = 'https://api.greenpt.ai/v1';
// What "set up key" adds to an ai-keys.toml that predates GreenPT (the
// file is only ever created from the example once). A live section with
// a placeholder key, like the example's [anthropic] one - resolveGreenPT
// ignores the placeholder. It was first written commented out, to be
// uncommented by hand, and the very first use uncommented only the
// api_key line: the key then belonged to whatever section came before
// it ([anthropic], replacing that key) and GreenPT still had none.
const GREENPT_KEYS_TEMPLATE = [
	'',
	'# GreenPT (https://greenpt.com) - create a key in your GreenPT account',
	'# and paste it between the quotes below, replacing sk-...',
	'[greenpt]',
	'api_key = "sk-..."',
	'',
].join('\n');
// How long Ollama keeps a model in memory after its last use. Ollama's own
// default is 5 minutes, after which the next call pays the full load time
// again - too short for a patch that sits idle between prompts. Sent with
// both the warm-up (ollamaWarm) and every completion, since each request
// resets the timer to whatever that request asked for.
const OLLAMA_KEEP_ALIVE = '30m';

// ---- tiny flat TOML reader (sections + key = "value", # comments) ----
function readToml(filePath) {
	const out = {};
	let text;
	try { text = fs.readFileSync(filePath, 'utf8'); } catch (e) { return out; }
	let section = null;
	text.split(/\r?\n/).forEach(function(raw) {
		const line = raw.replace(/#.*$/, '').trim();
		if (!line) return;
		const sec = line.match(/^\[([^\]]+)\]$/);
		if (sec) { section = sec[1].trim(); out[section] = out[section] || {}; return; }
		const kv = line.match(/^([A-Za-z0-9_.\-]+)\s*=\s*(.+)$/);
		if (!kv) return;
		let v = kv[2].trim();
		if ((v[0] === '"' && v[v.length - 1] === '"') || (v[0] === "'" && v[v.length - 1] === "'")) {
			v = v.slice(1, -1);
		}
		(section ? out[section] : out)[kv[1]] = v;
	});
	return out;
}

function keysFilePath() {
	return path.join(app.getPath('userData'), 'ai-keys.toml');
}

// { key, source: 'env'|'file'|'none', baseURL? }
function resolveAnthropic() {
	if (process.env.ANTHROPIC_API_KEY) {
		return { key: process.env.ANTHROPIC_API_KEY, source: 'env' };
	}
	const toml = readToml(keysFilePath());
	if (toml.anthropic && toml.anthropic.api_key && toml.anthropic.api_key.indexOf('sk-ant-...') !== 0) {
		return { key: toml.anthropic.api_key, source: 'file', baseURL: toml.anthropic.base_url };
	}
	return { key: null, source: 'none' };
}

// { key, source: 'env'|'file'|'none', baseURL? }
function resolveGreenPT() {
	if (process.env.GREENPT_API_KEY) {
		return { key: process.env.GREENPT_API_KEY, source: 'env' };
	}
	const toml = readToml(keysFilePath());
	if (toml.greenpt && toml.greenpt.api_key && toml.greenpt.api_key.indexOf('sk-...') !== 0) {
		return { key: toml.greenpt.api_key, source: 'file', baseURL: toml.greenpt.base_url };
	}
	return { key: null, source: 'none' };
}

function trimSlash(u) { return String(u || '').replace(/\/+$/, ''); }

function greenptErrorMessage(status, text) {
	let detail = '';
	try {
		const body = JSON.parse(text);
		detail = (body.error && (body.error.message || body.error)) || body.message || '';
	} catch (e) { detail = String(text || '').slice(0, 200); }
	if (status === 401 || status === 403) return 'Invalid GreenPT API key';
	if (status === 404) return 'Model not found: check the model id';
	if (status === 429) return 'Rate limited or out of credit — wait a moment and retry';
	if (status >= 500) return 'GreenPT service error (' + status + ')';
	return 'GreenPT error ' + status + (detail ? ': ' + String(detail).slice(0, 200) : '');
}

function anthropicErrorMessage(status, text) {
	let detail = '';
	try { detail = JSON.parse(text).error.message; } catch (e) { detail = String(text || '').slice(0, 200); }
	if (status === 401 || status === 403) return 'Invalid Anthropic API key';
	if (status === 404) return 'Model not found: check the model id';
	if (status === 429) return 'Rate limited — wait a moment and retry';
	if (status >= 500) return 'Anthropic service error (' + status + ')';
	return 'Anthropic error ' + status + (detail ? ': ' + detail : '');
}

// ---- completion ----

async function anthropicComplete(opts) {
	const cfg = resolveAnthropic();
	if (!cfg.key) {
		return { error: 'No Anthropic API key. Use "set up key" to add one.', code: 'no-key' };
	}
	const base = trimSlash(opts.baseURL || cfg.baseURL || DEFAULT_ANTHROPIC_BASE);
	const wantTemp = typeof opts.temperature === 'number' && !isNaN(opts.temperature);

	const body = {
		model: opts.model,
		max_tokens: parseInt(opts.maxTokens, 10) || 1024,
		messages: [{ role: 'user', content: String(opts.user || '') }],
	};
	if (opts.system) body.system = String(opts.system);
	if (wantTemp) body.temperature = opts.temperature;

	async function call(withTemp) {
		const b = Object.assign({}, body);
		if (!withTemp) delete b.temperature;
		return fetch(base + '/v1/messages', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-api-key': cfg.key,
				'anthropic-version': ANTHROPIC_VERSION,
			},
			body: JSON.stringify(b),
		});
	}

	try {
		let res = await call(wantTemp);
		let tempDropped = false;

		// Current-gen Anthropic models reject `temperature` with a 400
		// (sampling params removed in favour of effort). Retry without it.
		if (!res.ok && res.status === 400 && wantTemp) {
			const t = await res.text();
			if (/temperature|sampling|top_p|top_k/i.test(t)) {
				res = await call(false);
				tempDropped = true;
			} else {
				return { error: anthropicErrorMessage(400, t), code: '400' };
			}
		}
		if (!res.ok) {
			const t = await res.text();
			return { error: anthropicErrorMessage(res.status, t), code: String(res.status) };
		}
		const data = await res.json();
		const text = (data.content || [])
			.filter(function(blk) { return blk.type === 'text'; })
			.map(function(blk) { return blk.text; })
			.join('');
		return { text: text, model: data.model, tempDropped: tempDropped };
	} catch (e) {
		return { error: 'Could not reach Anthropic: ' + e.message, code: 'network' };
	}
}

// OpenAI-style chat completion: system + user messages in, the first
// choice's message content out.
async function greenptComplete(opts) {
	const cfg = resolveGreenPT();
	if (!cfg.key) {
		return { error: 'No GreenPT API key. Use "set up key" to add one.', code: 'no-key' };
	}
	const base = trimSlash(opts.baseURL || cfg.baseURL || DEFAULT_GREENPT_BASE);
	const messages = [];
	if (opts.system) messages.push({ role: 'system', content: String(opts.system) });
	messages.push({ role: 'user', content: String(opts.user || '') });

	const body = {
		model: opts.model,
		messages: messages,
		max_tokens: parseInt(opts.maxTokens, 10) || 1024,
		stream: false,
	};
	if (typeof opts.temperature === 'number' && !isNaN(opts.temperature)) body.temperature = opts.temperature;

	try {
		const res = await fetch(base + '/chat/completions', {
			method: 'POST',
			headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + cfg.key },
			body: JSON.stringify(body),
		});
		if (!res.ok) {
			const t = await res.text();
			return { error: greenptErrorMessage(res.status, t), code: String(res.status) };
		}
		const data = await res.json();
		const message = data.choices && data.choices[0] && data.choices[0].message;
		let text = message && message.content;
		// Content is normally a string; tolerate the array-of-parts form too.
		if (Array.isArray(text)) {
			text = text.map(function(part) { return (part && part.text) || ''; }).join('');
		}
		return { text: text || '', model: data.model };
	} catch (e) {
		return { error: 'Could not reach GreenPT: ' + e.message, code: 'network' };
	}
}

async function ollamaComplete(opts) {
	const base = trimSlash(opts.baseURL || DEFAULT_OLLAMA_BASE);
	const messages = [];
	if (opts.system) messages.push({ role: 'system', content: String(opts.system) });
	messages.push({ role: 'user', content: String(opts.user || '') });

	const options = {};
	if (typeof opts.temperature === 'number' && !isNaN(opts.temperature)) options.temperature = opts.temperature;
	const nPredict = parseInt(opts.maxTokens, 10);
	if (nPredict) options.num_predict = nPredict;

	const body = { model: opts.model, messages: messages, stream: false, keep_alive: OLLAMA_KEEP_ALIVE };
	if (Object.keys(options).length) body.options = options;

	try {
		const res = await fetch(base + '/api/chat', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
		});
		if (!res.ok) {
			const t = await res.text();
			if (res.status === 404) return { error: 'Ollama: model "' + opts.model + '" not pulled. Run: ollama pull ' + opts.model, code: '404' };
			return { error: 'Ollama error ' + res.status + (t ? ': ' + t.slice(0, 200) : ''), code: String(res.status) };
		}
		const data = await res.json();
		return { text: (data.message && data.message.content) || '' };
	} catch (e) {
		if (/ECONNREFUSED|fetch failed|ENOTFOUND/i.test(e.message)) {
			return { error: 'Ollama not reachable at ' + base + ' — is it running?', code: 'no-ollama' };
		}
		return { error: 'Could not reach Ollama: ' + e.message, code: 'network' };
	}
}

// ---- warm-up ----

// Has Ollama load the model into memory ahead of the first real prompt,
// so that prompt doesn't also pay the load time (seconds, for a model
// that isn't already resident). A chat request with no messages is
// Ollama's documented way to do that: it loads the model and returns
// without generating anything. Resolves once the model is loaded.
async function ollamaWarm(opts) {
	if (!opts.model) return { error: 'no-model' };
	const base = trimSlash(opts.baseURL || DEFAULT_OLLAMA_BASE);
	try {
		const res = await fetch(base + '/api/chat', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ model: opts.model, messages: [], stream: false, keep_alive: OLLAMA_KEEP_ALIVE }),
		});
		if (!res.ok) return { error: String(res.status) };
		await res.text();
		return { ok: true };
	} catch (e) {
		return { error: 'no-ollama' };
	}
}

// ---- model lists ----

async function anthropicModels() {
	const cfg = resolveAnthropic();
	if (!cfg.key) return { error: 'no-key' };
	const base = trimSlash(cfg.baseURL || DEFAULT_ANTHROPIC_BASE);
	try {
		const res = await fetch(base + '/v1/models?limit=100', {
			headers: { 'x-api-key': cfg.key, 'anthropic-version': ANTHROPIC_VERSION },
		});
		if (!res.ok) return { error: String(res.status) };
		const data = await res.json();
		return { models: (data.data || []).map(function(m) { return m.id; }) };
	} catch (e) {
		return { error: 'network' };
	}
}

async function greenptModels(baseURL) {
	const cfg = resolveGreenPT();
	if (!cfg.key) return { error: 'no-key' };
	const base = trimSlash(baseURL || cfg.baseURL || DEFAULT_GREENPT_BASE);
	try {
		const res = await fetch(base + '/models', { headers: { 'authorization': 'Bearer ' + cfg.key } });
		if (!res.ok) return { error: String(res.status) };
		const data = await res.json();
		// The same key also reaches GreenPT's embedding, reranking, OCR and
		// speech models, which /models lists alongside the chat ones -
		// leave those out of a dropdown that can only chat.
		const ids = (data.data || []).map(function(m) { return m.id; }).filter(function(id) {
			// (The list carries no capability field to go by, only ids;
			// "bge-" is an embedding family that doesn't say so.)
			return id && !/embed|rerank|ocr|whisper|speech|transcri|tts|^bge-/i.test(id);
		});
		return { models: ids };
	} catch (e) {
		return { error: 'network' };
	}
}

async function ollamaModels(baseURL) {
	const base = trimSlash(baseURL || DEFAULT_OLLAMA_BASE);
	try {
		const res = await fetch(base + '/api/tags');
		if (!res.ok) return { error: String(res.status) };
		const data = await res.json();
		return { models: (data.models || []).map(function(m) { return m.name; }) };
	} catch (e) {
		return { error: 'no-ollama' };
	}
}

// ---- IPC registration ----

module.exports = function registerLLMHandlers() {
	ipcMain.handle('llm-key-status', function(event, opts) {
		opts = opts || {};
		if (opts.provider === 'ollama') return { source: 'none-needed', hasKey: true };
		const cfg = opts.provider === 'greenpt' ? resolveGreenPT() : resolveAnthropic();
		return { source: cfg.source, hasKey: !!cfg.key, path: keysFilePath() };
	});

	ipcMain.handle('llm-open-keys-file', function() {
		const p = keysFilePath();
		if (!fs.existsSync(p)) {
			try {
				fs.copyFileSync(path.join(__dirname, 'ai-keys.toml.example'), p);
			} catch (e) { /* fall through to opening the folder */ }
		}
		// A keys file created before GreenPT existed has no [greenpt]
		// section to fill in - add a commented-out one. Appended only,
		// and only once; nothing already in the file is touched.
		try {
			if (fs.existsSync(p) && !/^\s*#?\s*\[greenpt\]/m.test(fs.readFileSync(p, 'utf8'))) {
				fs.appendFileSync(p, GREENPT_KEYS_TEMPLATE);
			}
		} catch (e) { /* read-only or unreadable - the user can still add it by hand */ }
		if (fs.existsSync(p)) shell.showItemInFolder(p);
		else shell.openPath(app.getPath('userData'));
		return p;
	});

	ipcMain.handle('llm-models', function(event, opts) {
		opts = opts || {};
		if (opts.provider === 'ollama') return ollamaModels(opts.baseURL);
		if (opts.provider === 'greenpt') return greenptModels(opts.baseURL);
		return anthropicModels();
	});

	// Only Ollama has anything to load - a cloud model is always "warm".
	ipcMain.handle('llm-warm', function(event, opts) {
		opts = opts || {};
		if (opts.provider === 'ollama') return ollamaWarm(opts);
		return { skipped: true };
	});

	ipcMain.handle('llm-complete', function(event, opts) {
		opts = opts || {};
		if (opts.provider === 'ollama') return ollamaComplete(opts);
		if (opts.provider === 'greenpt') return greenptComplete(opts);
		return anthropicComplete(opts);
	});
};
