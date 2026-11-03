define([
	'backbone',
	'rivets',
	'views/item/WidgetMulti',
	'text!./template.js',
	'utils/DecideScript',
],
function(Backbone, rivets, WidgetView, Template, DecideScript){
	'use strict';

	/**
	 * Decide: text in, a fast "System One" decision model answers a short
	 * script of yes/no, choice and score questions, one outlet per
	 * question. Plan and spike results: plans/decision-widget.md.
	 * Local Ollama only for now (TypeSafe's hosted Jev later); the
	 * request goes through server/llmProxy.js ('decide').
	 */

	var STARTER_SCRIPT = [
		'lights: choice on | off | dim | none=Not about the lights',
		'        What does the speaker want the lights to do?',
		'upset:  yes/no Is the speaker frustrated or annoyed?',
	].join('\n');

	var DEFAULT_MODEL = 'tev1:4b';
	var DEFAULT_BASE_URL = 'http://localhost:11434';
	var OUT_FIELDS = ['out1', 'out2', 'out3', 'out4'];
	// Text the warm-up decides on: anything short does.
	var WARM_TEXT = 'hello';

	// Generate: which model writes the questions, before one is picked.
	// A model picked in this or any Decide widget is remembered per
	// provider; failing that, the LLM widget's last pick; then these.
	var GEN_DEFAULT_MODEL = {anthropic: 'claude-sonnet-5', greenpt: 'green-l', ollama: ''};
	function storedGenModel(provider) {
		try {
			return localStorage.getItem('ntk.decide.genModel.' + provider) ||
				localStorage.getItem('ntk.llm.lastModel.' + provider) || GEN_DEFAULT_MODEL[provider] || '';
		} catch(e) { return GEN_DEFAULT_MODEL[provider] || ''; }
	}
	function rememberGenModel(provider, model) {
		try { if(model) { localStorage.setItem('ntk.decide.genModel.' + provider, model); } } catch(e) { /* not fatal */ }
	}

	function toNumber(value, fallback) {
		var n = parseFloat(value);
		return isNaN(n) ? fallback : n;
	}

	return WidgetView.extend({
		widgetEvents: {
			'click .decideButton': 'onDecideButton',
			// rv-value only publishes on 'change' (blur): push each key so
			// the pause timer runs while typing, and decide on Enter.
			'input .decideText': 'onTextInput',
			'keydown .decideText': 'onTextKey',
			'focus .decideText': 'enableWarm',
			'input .decideScript': 'checkScript',
			'scroll .decideScript': 'syncGutterScroll',
			'mousedown .decideErrors li': 'jumpToError',
			'focus .decideModel': 'fetchModels',
			'click .decideGenerate': 'generate',
			'click .decideUse': 'usePreview',
			'click .decideKeep': 'keepMine',
			'click .decideSetupKey': 'setupKey',
			'change .decideGenProvider': 'onGenProviderChange',
			'focus .decideGenModel': 'fetchGenModels',
			'click .decideTests li': 'runTestPhrase',
			'click .decideTestAll': 'testAll',
		},
		ins: [
			{title: 'text', to: 'in'},
		],
		outs: [
			{title: 'out1', from: 'out1', to: 'out1'},
			{title: 'out2', from: 'out2', to: 'out2'},
			{title: 'out3', from: 'out3', to: 'out3'},
			{title: 'out4', from: 'out4', to: 'out4'},
		],
		sources: [],
		typeID: 'Decide',
		className: 'decide',
		categories: ['AI'],
		template: _.template(Template),

		initialize: function(options) {
			WidgetView.prototype.initialize.call(this, options);

			// Read by onModelChange, which the set() below fires - must
			// exist first (see CLAUDE.md's Rivets/Backbone gotchas).
			this.parsed = DecideScript.parse('');
			this._pauseTimer = null;
			this._callID = null;
			this._sentText = null;
			this._pending = false;
			this._restoring = false;
			this._warmEnabled = false;
			this._warmTimer = null;
			this._warmedKey = '';
			this._lastText = undefined;
			this._genCallID = null;
			this._genTimer = null;
			this._applyTimer = null;
			this._testResults = {};
			this._testing = false;

			var get = function(field, fallback) {
				var v = this.model.get(field);
				return v === undefined ? fallback : v;
			}.bind(this);

			this.model.set({
				title: 'Decide',
				script: get('script', STARTER_SCRIPT),
				model: get('model', DEFAULT_MODEL),
				baseURL: get('baseURL', DEFAULT_BASE_URL),
				threshold: get('threshold', 0.5),
				gate: get('gate', true),
				autoDecide: get('autoDecide', true),
				// The spike: a decision takes 0.3-0.8 s, so don't send one
				// for every word of a sentence still arriving.
				pause: get('pause', 400),
				binary: get('binary', false),
				// The shared model defaults `in` to the number 0 (WidgetConfig.js) -
				// only a string is real text. A loaded patch's text arrives
				// later, through setFromModel.
				in: typeof this.model.get('in') === 'string' ? this.model.get('in') : '',
				out1: 0, out2: 0, out3: 0, out4: 0,
				// Display only.
				line1: '', line2: '', line3: '', line4: '',
				tip1: '', tip2: '', tip3: '', tip4: '',
				conf1: 0, conf2: 0, conf3: 0, conf4: 0,
				low1: false, low2: false, low3: false, low4: false,
				held1: false, held2: false, held3: false, held4: false,
				scriptErrors: [],
				statusText: '',
				statusTitle: '',
				hasError: false,
				busy: false,

				// Generate: a plain description -> an LLM writes the script
				// and test phrases (only while building, never at run time).
				request: get('request', ''),
				genProvider: get('genProvider', ''),
				genModel: get('genModel', ''),
				testPhrases: get('testPhrases', []),
				genStatus: '',
				genError: false,
				genNeedsKey: false,
				genBusy: false,
				hasPreview: false,
				previewScript: '',
				previewTests: [],
				previewNotes: [],
				tests: [],
				hasTests: false,
				testSummary: '',
				testing: false,
			});

			this.loadScript();
			this.renderTests();
		},

		onRender: function() {
			// Must be registered before WidgetView.prototype.onRender -
			// see CLAUDE.md's Rivets/Backbone gotcha.
			rivets.binders.decidebar = function(el, value) {
				el.style.width = Math.round(Math.max(0, Math.min(1, toNumber(value, 0))) * 100) + '%';
			};

			WidgetView.prototype.onRender.call(this);
			// A datalist needs an id of its own for the input's list=.
			var listID = 'decideModels-' + this.cid;
			this.$('.decideModelList').attr('id', listID);
			this.$('.decideModel').attr('list', listID);
			this.$('.decideGenModelList').attr('id', listID + '-gen');
			this.$('.decideGenModel').attr('list', listID + '-gen');
			this.nameOutlets();
			this.renderGutter();
			if(!window.ntkElectron || !window.ntkElectron.decide) {
				this.setStatus('needs the desktop app', '', true);
				return;
			}
			this.fetchModels();
			this.pickGenProvider();
		},

		onRemove: function() {
			if(this._pauseTimer) { clearTimeout(this._pauseTimer); }
			if(this._warmTimer) { clearTimeout(this._warmTimer); }
			if(this._genTimer) { clearInterval(this._genTimer); }
			if(this._applyTimer) { clearTimeout(this._applyTimer); }
			this.cancelCall();
		},

		// A saved patch's text arriving isn't new text - don't decide on
		// it, but do get the model loaded, since the patch will be used.
		setFromModel: function(model) {
			this._restoring = true;
			try {
				WidgetView.prototype.setFromModel.call(this, model);
			} finally {
				this._restoring = false;
			}
			if(this._pauseTimer) { clearTimeout(this._pauseTimer); this._pauseTimer = null; }
			this.model.set('busy', false);
			this.setStatus('', '', false);
			this.enableWarm();
			return this;
		},

		// ---- the script ----

		loadScript: function() {
			this.parsed = DecideScript.parse(this.model.get('script'));
			this.showErrors(this.parsed);
			var d = {};
			for(var i = 0; i < 4; i++) {
				var q = this.parsed.questions[i];
				d['line' + (i + 1)] = q ? q.name + ': –' : '';
				d['tip' + (i + 1)] = q ? q.name + ' (out' + (i + 1) + ')' : '';
				d['conf' + (i + 1)] = 0;
				d['low' + (i + 1)] = false;
				d['held' + (i + 1)] = false;
			}
			this.model.set(d);
			this.nameOutlets();
			if(!this.parsed.ok) {
				var e = this.parsed.errors[0];
				this.setStatus('script error', 'line ' + e.line + ': ' + e.message, true);
			} else if(this.model.get('hasError') && this.model.get('statusText') === 'script error') {
				this.setStatus('', '', false);
			}
		},

		// The question names as the nubs' tooltips ("lights (out1)").
		// Set on the elements directly: the outs list itself must stay as
		// it is, since the cables hang on its rendered nubs.
		nameOutlets: function() {
			var nubs = this.$('.widgetRight .outlet');
			for(var i = 0; i < nubs.length && i < 4; i++) {
				var q = this.parsed.questions[i];
				nubs.eq(i).attr('title', q ? q.name + ' (out' + (i + 1) + ')' : 'out' + (i + 1) + ' (no question)');
			}
		},

		showErrors: function(parsed) {
			this.gutterErrors = parsed.errors;
			this.model.set('scriptErrors', parsed.errors.map(function(e) { return 'line ' + e.line + ': ' + e.message; }));
			this.renderGutter();
		},

		// Errors are listed as you type, and the questions apply on their
		// own once typing pauses - if they read. Applying only on leaving
		// the box (rv-value's 'change') caught Phil out: he added an
		// option, tried it, and got answers from the old questions.
		// With mistakes, the last good questions stay in use.
		checkScript: function(e) {
			var text = e.target.value;
			var parsed = DecideScript.parse(text);
			this.gutterText = text;
			this.showErrors(parsed);
			if(this._applyTimer) { clearTimeout(this._applyTimer); }
			if(!parsed.ok) { return; }
			this._applyTimer = setTimeout(function() {
				this._applyTimer = null;
				if(text !== this.model.get('script')) { this.model.set('script', text); }
			}.bind(this), 600);
		},

		// Line numbers beside the script box, lines with an error in red
		// (as Scene's). Imperative, so loadScript can call it when a loaded
		// patch's script arrives through onModelChange.
		renderGutter: function() {
			var $gutter = this.$('.decideGutter');
			if(!$gutter.length) { return; }
			var text = this.gutterText !== undefined ? this.gutterText : this.model.get('script');
			this.gutterText = undefined;
			var count = String(text || '').split('\n').length;
			var bad = {};
			(this.gutterErrors || []).forEach(function(e) {
				bad[e.line] = (bad[e.line] ? bad[e.line] + '\n' : '') + e.message;
			});
			var html = [];
			for(var n = 1; n <= count; n++) {
				html.push(bad[n] ? '<span class="error" title="' + _.escape(bad[n]) + '">' + n + '</span>' : String(n));
			}
			for(var k = 0; k < 12; k++) { html.push(''); }
			$gutter.html(html.join('\n'));
			this.syncGutterScroll();
		},

		syncGutterScroll: function() {
			var textarea = this.$('.decideScript')[0];
			if(textarea) { this.$('.decideGutter').scrollTop(textarea.scrollTop); }
		},

		// mousedown, not click: a click would blur the box first, which
		// applies the script and re-renders this list under the mouse.
		jumpToError: function(e) {
			e.preventDefault();
			var m = /^line (\d+):/.exec($(e.currentTarget).text());
			var textarea = this.$('.decideScript')[0];
			if(!m || !textarea) { return; }
			var lines = textarea.value.split('\n');
			var line = Math.min(parseInt(m[1], 10), lines.length) - 1;
			var start = 0;
			for(var i = 0; i < line; i++) { start += lines[i].length + 1; }
			textarea.focus();
			textarea.setSelectionRange(start, start + lines[line].length);
		},

		// ---- the text ----

		onTextInput: function(e) {
			this.model.set('in', e.currentTarget.value);
		},

		onTextKey: function(e) {
			if(e.key === 'Enter') {
				e.preventDefault();
				this.model.set('in', e.currentTarget.value);
				this.decide(false);
			}
		},

		onDecideButton: function(e) {
			e.preventDefault();
			e.stopPropagation();
			this.decide(false);
		},

		currentText: function() {
			return String(this.model.get('in') === undefined || this.model.get('in') === null ? '' : this.model.get('in')).trim();
		},

		schedule: function() {
			if(this._pauseTimer) { clearTimeout(this._pauseTimer); }
			var pause = parseInt(this.model.get('pause'), 10);
			if(isNaN(pause) || pause < 0) { pause = 400; }
			this._pauseTimer = setTimeout(function() {
				this._pauseTimer = null;
				this.decide(true);
			}.bind(this), pause);
		},

		// ---- deciding ----

		// `auto`: from the pause timer, not a click - an empty text or a
		// script error is then just nothing to do, not something to report.
		decide: function(auto) {
			if(this._pauseTimer) { clearTimeout(this._pauseTimer); this._pauseTimer = null; }
			if(!window.ntkElectron || !window.ntkElectron.decide) {
				this.setStatus('needs the desktop app', '', true);
				return;
			}
			if(!this.parsed.ok) {
				if(!auto) { this.loadScript(); }
				return;
			}
			var text = this.currentText();
			if(!text) {
				if(!auto) { this.setStatus('no text', 'Type something above, or wire text into the inlet', true); }
				return;
			}
			// One request at a time. Text that arrives meanwhile is decided
			// on when this one comes back - only the newest, not each.
			if(this._callID) {
				if(text !== this._sentText) { this._pending = true; }
				return;
			}
			this._pending = false;
			this._warmEnabled = true;
			this._sentText = text;
			var callID = this._callID = this.cid + '-' + Date.now();
			var parsed = this.parsed;
			var model = String(this.model.get('model') || '').trim();
			var baseURL = String(this.model.get('baseURL') || '').trim() || undefined;
			this.model.set('busy', true);
			this.setStatus('deciding…', '', false);
			window.ntkElectron.decide({
				requestID: callID,
				model: model,
				baseURL: baseURL,
				state: text,
				questions: DecideScript.request(parsed.questions),
			}).then(function(res) {
				if(callID !== this._callID) { return; }
				this._callID = null;
				this.model.set('busy', false);
				if(!res || res.canceled) { this.setStatus('', '', false); }
				else if(res.error) { this.setStatus(this.shortError(res), res.error, true); }
				else {
					this._warmedKey = model + '|' + (baseURL || '');
					// Text changed while this was out: its answers are
					// already stale, so go straight on to the new text.
					if(this._pending && this.currentText() !== text) {
						this.decide(true);
						return;
					}
					this.applyAnswers(parsed, res.answers);
					this.markTest(text, parsed, res.answers);
					this.setStatus(res.ms + ' ms', 'How long the decision took', false);
				}
				var again = this._pending && this.currentText() !== this._sentText;
				this._pending = false;
				if(again) { this.decide(true); }
			}.bind(this));
		},

		shortError: function(res) {
			if(res.code === '404') { return 'model not installed'; }
			if(res.code === 'no-ollama') { return 'Ollama not running'; }
			if(res.code === 'not-decision') { return 'not a decision model'; }
			if(res.code === 'no-model') { return 'pick a model'; }
			return 'error';
		},

		cancelCall: function() {
			var callID = this._callID;
			this._callID = null;
			if(callID && window.ntkElectron && window.ntkElectron.llmCancel) {
				window.ntkElectron.llmCancel(callID);
			}
		},

		/**
		 * applyAnswers - show every answer, and send the ones that count.
		 * The threshold only applies to answers that pick one thing: a
		 * choice, and yes/no when it sends 0 or 1023. A yes/no probability
		 * or a score's weighted level already says how sure it is, and
		 * holding one back left it stuck (a strong "yes" stayed on through
		 * every weak "no" after it). The gate - the first question is a
		 * choice that answered none - holds all the others.
		 */
		applyAnswers: function(parsed, answers) {
			var threshold = toNumber(this.model.get('threshold'), 0.5);
			var binary = !!this.model.get('binary');
			var results = parsed.questions.map(function(q) {
				return DecideScript.answer(q, answers && answers[q.name], {binary: binary});
			});
			var first = parsed.questions[0];
			var gated = !!this.model.get('gate') && first && first.type === 'choice' &&
				results[0] && results[0].none && results[0].confidence >= threshold;

			var d = {}, changedOutlets = [];
			for(var i = 0; i < 4; i++) {
				var n = i + 1, q = parsed.questions[i], r = results[i];
				if(!q || !r) { continue; }
				var picks = q.type === 'choice' || (q.type === 'noul' && binary);
				var low = picks && r.confidence < threshold;
				var held = gated && i > 0;
				d['line' + n] = q.name + ': ' + r.text;
				d['conf' + n] = r.confidence;
				d['low' + n] = low;
				d['held' + n] = held && !low;
				d['tip' + n] = q.name + ' (out' + n + '): ' + r.text + ', ' + Math.round(r.confidence * 100) + '% sure' +
					(low ? ' - below the threshold, outlet unchanged' : held ? ' - held: "' + first.name + '" answered none' : '');
				if(!low && !held && r.value !== this.model.get(OUT_FIELDS[i])) {
					d[OUT_FIELDS[i]] = r.value;
					changedOutlets.push(i);
				}
			}
			this.model.set(d);
			this.flash(changedOutlets);
		},

		// A short highlight on each line whose outlet just changed, so
		// it's visible that the widget acted.
		flash: function(indexes) {
			var lines = this.$('.decideLine');
			indexes.forEach(function(i) {
				var el = lines.eq(i);
				el.removeClass('flash');
				// Restart the animation if it's still running.
				if(el[0]) { void el[0].offsetWidth; }
				el.addClass('flash');
			});
		},

		setStatus: function(text, title, isError) {
			this.model.set({statusText: text, statusTitle: title || text, hasError: !!isError});
		},

		// ---- warm-up ----
		// The first decision after a model loads takes 2-7 s. Ollama won't
		// load a decision model any other way, so warm up by deciding on
		// a short text with the real script (spike section 8). Only once
		// the widget is clearly in use: it came in with a patch, or its
		// text box got focus - dropping one on the canvas shouldn't load
		// a model.
		enableWarm: function() {
			this._warmEnabled = true;
			this.scheduleWarm();
		},

		scheduleWarm: function() {
			if(!this._warmEnabled || !window.ntkElectron || !window.ntkElectron.decide) { return; }
			if(this._warmTimer) { clearTimeout(this._warmTimer); }
			this._warmTimer = setTimeout(function() {
				this._warmTimer = null;
				this.warm();
			}.bind(this), 800);
		},

		warm: function() {
			var model = String(this.model.get('model') || '').trim();
			var baseURL = String(this.model.get('baseURL') || '').trim() || undefined;
			var key = model + '|' + (baseURL || '');
			if(!model || !this.parsed.ok || key === this._warmedKey || this._callID) { return; }
			this._warmedKey = key;
			if(!this.model.get('statusText')) { this.setStatus('loading…', 'Loading ' + model + ' so the first decision is quick', false); }
			window.ntkElectron.decide({model: model, baseURL: baseURL, state: WARM_TEXT,
				questions: DecideScript.request(this.parsed.questions)}).then(function(res) {
				if(res && res.error) {
					// Say what's wrong now rather than at the first real
					// text; allow a retry when something changes.
					this._warmedKey = '';
					if(!this._callID) { this.setStatus(this.shortError(res), res.error, true); }
				} else if(this.model.get('statusText') === 'loading…') {
					this.setStatus('ready', model + ' is loaded', false);
				}
			}.bind(this));
		},

		// The model picker lists the installed decision models.
		fetchModels: function() {
			if(!window.ntkElectron || !window.ntkElectron.decideModels) { return; }
			var baseURL = String(this.model.get('baseURL') || '').trim() || undefined;
			window.ntkElectron.decideModels({baseURL: baseURL}).then(function(res) {
				var list = this.$('.decideModelList').empty();
				((res && res.models) || []).forEach(function(name) {
					list.append($('<option>').attr('value', name));
				});
			}.bind(this));
		},

		// ---- Generate: an LLM writes the questions ----

		// A new widget's generator: Anthropic if a key is set up (it wrote
		// the best questions in the spike, in ~3 s), else a local Ollama
		// chat model.
		pickGenProvider: function() {
			if(this.model.get('genProvider')) { this.fetchGenModels(); return; }
			var choose = function(provider) {
				this.model.set({genProvider: provider, genModel: storedGenModel(provider)});
				this.fetchGenModels();
			}.bind(this);
			if(!window.ntkElectron || !window.ntkElectron.llmKeyStatus) { choose('ollama'); return; }
			window.ntkElectron.llmKeyStatus('anthropic').then(function(k) {
				choose(k && k.hasKey ? 'anthropic' : 'ollama');
			});
		},

		onGenProviderChange: function() {
			var provider = this.$('.decideGenProvider').val();
			this.model.set({genProvider: provider, genModel: storedGenModel(provider),
				genStatus: '', genError: false, genNeedsKey: false});
			this.fetchGenModels();
		},

		// The provider's models for the picker. For Ollama, only chat
		// models: a decision model can't write.
		fetchGenModels: function() {
			var api = window.ntkElectron;
			if(!api || !api.llmModels) { return; }
			var provider = this.model.get('genProvider');
			if(!provider) { return; }
			var baseURL = provider === 'ollama' ? (String(this.model.get('baseURL') || '').trim() || undefined) : undefined;
			var decisionModels = provider === 'ollama' && api.decideModels ? api.decideModels({baseURL: baseURL}) : Promise.resolve({models: []});
			Promise.all([api.llmModels({provider: provider, baseURL: baseURL}), decisionModels]).then(function(r) {
				if(this.model.get('genProvider') !== provider) { return; }
				var exclude = (r[1] && r[1].models) || [];
				var models = ((r[0] && r[0].models) || []).filter(function(m) { return exclude.indexOf(m) === -1; });
				var list = this.$('.decideGenModelList').empty();
				models.forEach(function(m) { list.append($('<option>').attr('value', m)); });
				if(!this.model.get('genModel') && models.length) { this.model.set('genModel', models[0]); }
			}.bind(this));
		},

		setupKey: function(e) {
			e.preventDefault();
			if(window.ntkElectron && window.ntkElectron.llmOpenKeysFile) {
				window.ntkElectron.llmOpenKeysFile().then(function() {
					this.model.set({genStatus: 'paste the key into ai-keys.toml, save it, then generate again', genError: false, genNeedsKey: false});
				}.bind(this));
			}
		},

		setGenStatus: function(text, isError, needsKey) {
			this.model.set({genStatus: text, genError: !!isError, genNeedsKey: !!needsKey});
		},

		generate: function(e) {
			if(e) { e.preventDefault(); }
			var api = window.ntkElectron;
			if(!api || !api.llmComplete) { this.setGenStatus('needs the desktop app', true); return; }
			if(this._genCallID) { return; }
			// The request box publishes on blur; read it directly too, so
			// a click straight after typing sends what was typed.
			var request = String(this.$('.decideRequest').val() || this.model.get('request') || '').trim();
			this.model.set('request', request);
			if(!request) { this.setGenStatus('describe what the widget should decide first', true); return; }
			var provider = this.model.get('genProvider') || 'ollama';
			var model = String(this.model.get('genModel') || '').trim();
			if(!model) { this.setGenStatus(provider === 'ollama' ? 'pick an Ollama chat model (ollama pull gemma4:12b)' : 'pick a model', true); return; }
			rememberGenModel(provider, model);

			var callID = this._genCallID = this.cid + '-gen-' + Date.now();
			var started = Date.now();
			this.model.set({genBusy: true, hasPreview: false});
			var tick = function() { this.setGenStatus('writing the questions… ' + Math.round((Date.now() - started) / 1000) + ' s', false); }.bind(this);
			tick();
			this._genTimer = setInterval(tick, 500);

			api.llmComplete({
				requestID: callID,
				provider: provider,
				model: model,
				baseURL: provider === 'ollama' ? (String(this.model.get('baseURL') || '').trim() || undefined) : undefined,
				system: DecideScript.GENERATOR_PROMPT,
				user: request,
				maxTokens: 1500,
				// Ollama: a thinking model would think first, slowly.
				think: false,
			}).then(function(res) {
				if(callID !== this._genCallID) { return; }
				this._genCallID = null;
				clearInterval(this._genTimer);
				this._genTimer = null;
				this.model.set('genBusy', false);
				var took = ((Date.now() - started) / 1000).toFixed(1) + ' s';
				if(!res || res.canceled) { this.setGenStatus('', false); return; }
				if(res.error) { this.setGenStatus(res.error, true, res.code === 'no-key'); return; }
				this.showPreview(DecideScript.splitGenerated(res.text), took);
			}.bind(this));
		},

		// The new questions, next to the current ones, before anything
		// changes: what each outlet will carry, and any mistakes.
		showPreview: function(generated, took) {
			var next = DecideScript.parse(generated.script);
			// Nothing to look at: say so, and offer nothing to apply.
			if(!next.questions.length) {
				this.model.set({hasPreview: false});
				this.setGenStatus('took ' + took + ', but no questions came back - try again, or another model', true);
				return;
			}
			var notes = [];
			for(var i = 0; i < 4; i++) {
				var o = this.parsed.questions[i], n = next.questions[i];
				if(o && n && o.name === n.name) { continue; }
				if(o && n) { notes.push('out' + (i + 1) + ': ' + o.name + ' → ' + n.name); }
				else if(n) { notes.push('out' + (i + 1) + ': new, ' + n.name); }
				else if(o) { notes.push('out' + (i + 1) + ': ' + o.name + ' goes (no question)'); }
			}
			if(!notes.length && next.questions.length) { notes.push('each outlet keeps its question name'); }
			next.errors.forEach(function(e) { notes.push('line ' + e.line + ': ' + e.message); });
			if(!generated.tests.length) { notes.push('no test phrases came back'); }
			this.model.set({
				previewScript: generated.script,
				previewTests: generated.tests,
				previewNotes: notes,
				hasPreview: true,
			});
			this.setGenStatus('took ' + took + (next.ok ? ' - check the new questions below' : ' - the new questions have mistakes, see below'), !next.ok);
		},

		usePreview: function(e) {
			if(e) { e.preventDefault(); }
			var script = this.model.get('previewScript');
			if(!this.model.get('hasPreview') || !DecideScript.parse(script).questions.length) { return; }
			this.model.set({
				script: script,
				testPhrases: this.model.get('previewTests') || [],
				hasPreview: false,
			});
			this.setGenStatus('', false);
			// The box keeps its scroll position otherwise - lines showed
			// from the middle, as if cut off.
			this.$('.decideScript').scrollLeft(0).scrollTop(0);
			this.syncGutterScroll();
			// Show straight away how well the new questions work.
			if(this.parsed.ok && (this.model.get('testPhrases') || []).length) { this.testAll(); }
		},

		keepMine: function(e) {
			if(e) { e.preventDefault(); }
			this.model.set({hasPreview: false});
			this.setGenStatus('', false);
		},

		// ---- test phrases ----

		renderTests: function() {
			var phrases = this.model.get('testPhrases') || [];
			var results = this._testResults || {};
			var right = 0, checked = 0;
			var tests = phrases.map(function(t, i) {
				var r = results[i];
				var want = _.map(t.expect || {}, function(v, k) { return k + '=' + v; }).join(', ');
				var detail = 'Click to try it.' + (want ? ' Meant: ' + want + '.' : '');
				if(r) {
					checked++;
					if(r.ok) { right++; }
					detail += ' Got: ' + r.results.map(function(x) { return x.name + '=' + x.got + (x.ok === false ? ' ✗' : ''); }).join(', ') + '.';
				}
				return {index: i, phrase: t.phrase, mark: r ? (r.ok ? '✓' : '✗') : '·', pass: !!(r && r.ok), fail: !!(r && !r.ok), detail: detail};
			});
			this.model.set({
				tests: tests,
				hasTests: tests.length > 0,
				testSummary: checked ? right + ' of ' + checked + ' as intended' : '',
			});
		},

		// After any decision: if the text was one of the test phrases,
		// mark whether it came out as intended.
		markTest: function(text, parsed, answers) {
			var phrases = this.model.get('testPhrases') || [];
			var key = String(text).trim().toLowerCase();
			for(var i = 0; i < phrases.length; i++) {
				if(String(phrases[i].phrase).trim().toLowerCase() === key) {
					this._testResults[i] = DecideScript.checkTest(parsed.questions, answers, phrases[i].expect, {binary: !!this.model.get('binary')});
					this.renderTests();
					return;
				}
			}
		},

		// Clicking a test phrase feeds it through the widget like real
		// input - outlets included, so the rest of the patch can be tried.
		runTestPhrase: function(e) {
			var i = parseInt($(e.currentTarget).attr('data-index'), 10);
			var t = (this.model.get('testPhrases') || [])[i];
			if(!t) { return; }
			this.model.set('in', t.phrase);
			this.decide(false);
		},

		// Every phrase, one after another, without touching the outlets.
		testAll: function(e) {
			if(e) { e.preventDefault(); }
			var api = window.ntkElectron;
			var phrases = this.model.get('testPhrases') || [];
			if(this._testing || !api || !api.decide || !phrases.length) { return; }
			if(!this.parsed.ok) { this.model.set('testSummary', 'fix the questions first'); return; }
			var parsed = this.parsed;
			var model = String(this.model.get('model') || '').trim();
			var baseURL = String(this.model.get('baseURL') || '').trim() || undefined;
			var binary = !!this.model.get('binary');
			this._testing = true;
			this._testResults = {};
			this.renderTests();
			this.model.set({testing: true, testSummary: 'testing…'});
			var next = function(i) {
				if(i >= phrases.length || parsed !== this.parsed) {
					this._testing = false;
					this.model.set('testing', false);
					this.renderTests();
					return;
				}
				api.decide({model: model, baseURL: baseURL, state: phrases[i].phrase,
					questions: DecideScript.request(parsed.questions)}).then(function(res) {
					if(res && res.error) {
						this._testing = false;
						this.model.set({testing: false, testSummary: res.error});
						return;
					}
					if(res && res.answers) {
						this._testResults[i] = DecideScript.checkTest(parsed.questions, res.answers, phrases[i].expect, {binary: binary});
						this.renderTests();
						this.model.set('testSummary', 'testing… ' + (i + 1) + ' of ' + phrases.length);
					}
					next(i + 1);
				}.bind(this));
			}.bind(this);
			next(0);
		},

		// ---- model changes ----

		onModelChange: function(model) {
			var changed = model.changedAttributes();
			if(!changed) { return; }

			if(changed.script !== undefined) {
				this.loadScript();
				this.scheduleWarm();
				// Marks from the old questions no longer say anything.
				this._testResults = {};
				this.renderTests();
			}
			if(changed.testPhrases !== undefined) {
				this._testResults = {};
				this.renderTests();
			}
			if(changed.model !== undefined || changed.baseURL !== undefined) {
				this.scheduleWarm();
			}
			if(changed.baseURL !== undefined) { this.fetchModels(); }
			// Act on new text only when it differs from the last seen -
			// a nested set() re-reports the same change (CLAUDE.md).
			if(changed.in !== undefined && !this._restoring) {
				var text = this.currentText();
				if(text !== this._lastText) {
					this._lastText = text;
					if(this.model.get('autoDecide') && text) { this.schedule(); }
				}
			}
		},
	});
});
