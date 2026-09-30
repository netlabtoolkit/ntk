'use strict';

// LLM proxy for the LLM widget. Runs in the Electron main process:
// keeps API keys out of the renderer and the saved patch, and avoids
// browser CORS. Wired up from electronApp.js; exposed to the renderer
// through preload.js's contextBridge as window.ntkElectron.llm*.
//
// v1 providers: Anthropic (cloud, needs a key) and Ollama (local, no
// key). Node 22 in the main process has global fetch - no HTTP dep.

const fs = require('fs');
const path = require('path');
const { ipcMain, shell, app } = require('electron');

const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_ANTHROPIC_BASE = 'https://api.anthropic.com';
const DEFAULT_OLLAMA_BASE = 'http://localhost:11434';

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

function trimSlash(u) { return String(u || '').replace(/\/+$/, ''); }

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

async function ollamaComplete(opts) {
	const base = trimSlash(opts.baseURL || DEFAULT_OLLAMA_BASE);
	const messages = [];
	if (opts.system) messages.push({ role: 'system', content: String(opts.system) });
	messages.push({ role: 'user', content: String(opts.user || '') });

	const options = {};
	if (typeof opts.temperature === 'number' && !isNaN(opts.temperature)) options.temperature = opts.temperature;
	const nPredict = parseInt(opts.maxTokens, 10);
	if (nPredict) options.num_predict = nPredict;

	const body = { model: opts.model, messages: messages, stream: false };
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
		const cfg = resolveAnthropic();
		return { source: cfg.source, hasKey: !!cfg.key, path: keysFilePath() };
	});

	ipcMain.handle('llm-open-keys-file', function() {
		const p = keysFilePath();
		if (!fs.existsSync(p)) {
			try {
				fs.copyFileSync(path.join(__dirname, 'ai-keys.toml.example'), p);
			} catch (e) { /* fall through to opening the folder */ }
		}
		if (fs.existsSync(p)) shell.showItemInFolder(p);
		else shell.openPath(app.getPath('userData'));
		return p;
	});

	ipcMain.handle('llm-models', function(event, opts) {
		opts = opts || {};
		if (opts.provider === 'ollama') return ollamaModels(opts.baseURL);
		return anthropicModels();
	});

	ipcMain.handle('llm-complete', function(event, opts) {
		opts = opts || {};
		if (opts.provider === 'ollama') return ollamaComplete(opts);
		return anthropicComplete(opts);
	});
};
