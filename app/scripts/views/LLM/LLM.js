define([
	'backbone',
	'rivets',
	'views/item/WidgetMulti',
	'text!./template.js',

	'utils/SignalChainFunctions',
	'utils/SignalChainClasses',
],
function(Backbone, rivets, WidgetView, Template, SignalChainFunctions, SignalChainClasses){
	'use strict';

	// Base instruction per mode. The rest of the system prompt is built
	// from the structured "personality" fields (see assembleSystem).
	var MODE_PREAMBLE = {
		answer: 'Answer the following prompt.',
		rewrite: 'Rewrite the following text as a new version. Output only the rewritten text.',
		summarize: 'Summarize the following text. Output only the summary.',
		argue: 'Argue against the following text, making the strongest case for the opposing view. Output only the argument.',
	};

	// Personality-trait options for each of the 4 trait dropdowns.
	// 'none' = skip, 'other' = use the adjacent free-text field.
	var TRAITS = ['none', 'humor', 'sarcasm', 'professionalism', 'scientific',
		'speculation', 'metaphorical', 'creativity', 'business', 'conversational',
		'clarity', 'accuracy', 'conciseness', 'verbosity', 'originality',
		'playfulness', 'eloquence', 'political', 'angry', 'kind', 'liberal',
		'centrist', 'conservative', 'persuasive', 'sales', 'confident', 'unsure',
		'tentative'];

	// Single-choice dropdowns (format, audience). '' = no clause,
	// 'other' = the adjacent free-text field. Values are phrased to drop
	// straight into the system-prompt clause.
	var CHOICES = {
		// "The purpose of the text is ___." ('' = omit the clause entirely.)
		format: [
			['', '(none)'],
			['an executive summary', 'an executive summary'],
			['a case study', 'a case study'],
			['a memoir', 'a memoir'],
			['an essay', 'an essay'],
			['an email', 'an email'],
			['a presentation', 'a presentation'],
			['a social media post', 'a social media post'],
			['other', 'other…'],
		],
		// "Write for this audience: ___." ('' = omit the clause entirely.)
		audience: [
			['', '(none)'],
			['an executive', 'an executive'],
			['an engineer', 'an engineer'],
			['a scientist', 'a scientist'],
			['a general reader', 'a general reader'],
			['a friend', 'a friend'],
			['other', 'other…'],
		],
	};

	// Shown before the model list has been fetched, or if the fetch fails.
	var FALLBACK_MODELS = {
		anthropic: ['claude-sonnet-5', 'claude-opus-5', 'claude-haiku-4-5', 'claude-fable-5-1'],
		ollama: [],
	};
	var DEFAULT_MODEL = {
		anthropic: 'claude-sonnet-5',
		ollama: '',
	};
	var DEFAULT_BASE_URL = {
		anthropic: '',
		ollama: 'http://localhost:11434',
	};

	return WidgetView.extend({
		ins: [
			{title: 'prompt', to: 'in'},
		],
		outs: [
			{title: 'text', from: 'output', to: 'out1'},
		],

		widgetEvents: {
			'click .sendButton': 'send',
			'change .providerSelect': 'onProviderChange',
			'change .modelSelect': 'onModelSelectChange',
			'click .refreshModels': 'fetchModels',
			'click .setupKey': 'openKeysFile',
			'change .traitSelect': 'traitSelectChange',
			'change .choiceSelect': 'choiceSelectChange',
			'input .tempSlider': 'onTempSlider',
			'change .tempSlider': 'onTempSlider',
			'click .randomPersonality': 'randomPersonality',
			'click .resetPersonality': 'resetPersonality',
		},
		sources: [],
		typeID: 'LLM',
		className: 'llm',
		categories: ['AI'],
		template: _.template(Template),

		initialize: function(options) {
			WidgetView.prototype.initialize.call(this, options);

			// Instance state referenced by onModelChange must exist before
			// the model.set() below (it fires 'change' synchronously).
			this._sendTimer = null;
			this.modelList = FALLBACK_MODELS.ollama.slice();

			this.model.set({
				title: 'LLM',
				in: '',            // the prompt (inlet or the text box)
				output: '',        // the outlet - last response, kept
				preview: '',       // truncated last response for the body

				mode: 'answer',
				// Default to local Ollama: no API key needed, so a new
				// widget works out of the box. Switch to Anthropic in the
				// "more" panel once a key is set up.
				provider: 'ollama',
				model: DEFAULT_MODEL.ollama,
				baseURL: DEFAULT_BASE_URL.ollama,

				temperature: 0.7,  // 0 = deterministic; max is provider-dependent (see updateTempRange)
				length: '',        // '' -> no length clause; words, or % for rewrite

				// 4 trait dropdowns + a free-text field each (used when
				// the dropdown is set to 'other').
				trait1: 'none', trait1Custom: '',
				trait2: 'none', trait2Custom: '',
				trait3: 'none', trait3Custom: '',
				trait4: 'none', trait4Custom: '',

				format: '',        // one of CHOICES.format, or 'other'
				formatCustom: '',
				audience: '',      // one of CHOICES.audience, or 'other'
				audienceCustom: '',
				markdown: true,    // ask for the response formatted as Markdown
				systemAppend: '',
				maxTokens: 1024,

				assembledSystem: '',
				autoSend: false,

				status: 'idle',    // idle | calling | error
				calling: false,
				statusText: '',
				keyText: '',
			});

			this.model.set('assembledSystem', this.assembleSystem());
		},

		onRender: function() {
			WidgetView.prototype.onRender.call(this);
			if(app.server) { return; }

			var self = this;
			this.$('.sendButton').css('cursor', 'pointer');
			this.modelSelectEl = this.$('.modelSelect').get(0);

			if(!window.ntkElectron || !window.ntkElectron.llmComplete) {
				this.setStatus('error', 'Needs the desktop app');
				return;
			}

			this.resetModelList();
			this.populateModelSelect();
			this.populateTraitSelects();
			this.populateChoiceSelect('format');
			this.populateChoiceSelect('audience');
			this.updateTempRange();
			this.refreshKeyStatus();
			this.fetchModels();
		},

		onRemove: function() {
			if(this._sendTimer) { clearTimeout(this._sendTimer); }
		},

		// Loading a saved patch (and the save round-trip, which reloads
		// it) applies the stored attributes via the base setFromModel.
		// The trait / purpose / audience dropdowns and the temp slider are
		// populated by JS, not rivets, so they don't pick up the restored
		// values on their own - re-sync them here.
		setFromModel: function(model) {
			WidgetView.prototype.setFromModel.call(this, model);
			if(!app.server) {
				this.syncPersonalityUI();
				this.populateModelSelect();
				this.refreshKeyStatus();
			}
			return this;
		},

		// ---- temperature slider ----
		// Anthropic caps temperature at 1.0 (and current-gen models reject
		// it entirely - the proxy strips it and the widget notes that);
		// Ollama / OpenAI-style go to 2.0.
		updateTempRange: function() {
			var slider = this.$('.tempSlider').get(0);
			if(!slider) { return; }
			var max = this.model.get('provider') === 'anthropic' ? 1 : 2;
			slider.max = max;
			var t = parseFloat(this.model.get('temperature'));
			if(isNaN(t)) { t = 0.7; }
			if(t > max) { t = max; this.model.set('temperature', t); }
			slider.value = t;
		},

		onTempSlider: function(e) {
			this.model.set('temperature', parseFloat(e.currentTarget.value));
		},

		// ---- structured system-prompt assembly ----

		lengthClause: function(mode, n) {
			if(!n || isNaN(n)) { return ''; }
			if(mode === 'rewrite') {
				return 'Make the result about ' + n + '% the length of the original.';
			}
			return 'Keep the response to about ' + n + ' words.';
		},

		effectiveTraits: function() {
			var m = this.model, out = [];
			for(var i = 1; i <= 4; i++) {
				var v = m.get('trait' + i);
				if(v === 'other') { v = String(m.get('trait' + i + 'Custom') || '').trim(); }
				if(v && v !== 'none' && out.indexOf(v) === -1) { out.push(v); }
			}
			return out;
		},

		effectiveChoice: function(field) {
			var v = this.model.get(field);
			if(v === 'other') { return String(this.model.get(field + 'Custom') || '').trim(); }
			return v || '';
		},

		assembleSystem: function() {
			var m = this.model;
			var mode = m.get('mode') || 'answer';
			var traits = this.effectiveTraits();
			var format = this.effectiveChoice('format');
			var audience = this.effectiveChoice('audience');
			var parts = [
				MODE_PREAMBLE[mode] || MODE_PREAMBLE.answer,
				traits.length && ('Write with these qualities: ' + traits.join(', ') + '.'),
				format && ('The purpose of the text is ' + format + '.'),
				audience && ('Write for this audience: ' + audience + '.'),
				this.lengthClause(mode, parseInt(m.get('length'), 10)),
				m.get('markdown') && 'Format the response using Markdown. Output only the Markdown, with no surrounding code fence.',
				m.get('systemAppend'),
			];
			return _.filter(parts, function(p) { return !!p; }).join('\n');
		},

		// ---- model / provider / key UI ----

		onProviderChange: function() {
			var provider = this.$('.providerSelect').val();
			this.model.set({
				provider: provider,
				model: DEFAULT_MODEL[provider] || '',
				baseURL: DEFAULT_BASE_URL[provider] || '',
			});
			this.resetModelList();
			this.populateModelSelect();
			this.updateTempRange();
			this.refreshKeyStatus();
			this.fetchModels();
		},

		// Seed the model dropdown with the current provider's built-in
		// list. fetchModels() replaces it with the live list once that
		// call returns; until then this keeps the dropdown from showing a
		// stale other-provider list (e.g. Anthropic models under Ollama
		// right after a patch load).
		resetModelList: function() {
			this.modelList = (FALLBACK_MODELS[this.model.get('provider')] || []).slice();
		},

		fetchModels: function() {
			if(app.server || !window.ntkElectron || !window.ntkElectron.llmModels) { return; }
			var self = this;
			window.ntkElectron.llmModels({
				provider: this.model.get('provider'),
				baseURL: this.model.get('baseURL') || undefined,
			}).then(function(res) {
				if(res && res.models && res.models.length) {
					self.modelList = res.models;
					self.populateModelSelect();
				}
			});
		},

		populateModelSelect: function() {
			var select = this.modelSelectEl;
			if(!select) { return; }
			var current = this.model.get('model');
			var list = this.modelList.slice();
			// A model from a saved patch that the provider no longer lists
			// stays selectable.
			if(current && list.indexOf(current) === -1) { list.unshift(current); }

			select.innerHTML = '';
			list.forEach(function(id) { select.appendChild(new Option(id, id)); });
			if(list.length) {
				select.value = list.indexOf(current) !== -1 ? current : list[0];
				this.model.set('model', select.value);
			}
		},

		onModelSelectChange: function() {
			this.model.set('model', this.$('.modelSelect').val());
		},

		// ---- personality trait dropdowns ----

		populateTraitSelects: function() {
			var self = this;
			this.$('.traitSelect').each(function() {
				var slot = $(this).data('slot');
				var current = self.model.get('trait' + slot) || 'none';
				this.innerHTML = '';
				for(var i = 0; i < TRAITS.length; i++) {
					this.appendChild(new Option(TRAITS[i] === 'none' ? '(none)' : TRAITS[i], TRAITS[i]));
				}
				this.appendChild(new Option('other…', 'other'));
				this.value = current;
			});
			this.updateTraitCustomVisibility();
		},

		updateTraitCustomVisibility: function() {
			var self = this;
			this.$('.traitCustom').each(function() {
				var slot = $(this).data('slot');
				$(this).toggle(self.model.get('trait' + slot) === 'other');
			});
		},

		traitSelectChange: function(e) {
			var slot = $(e.currentTarget).data('slot');
			this.model.set('trait' + slot, $(e.currentTarget).val());
			this.updateTraitCustomVisibility();
		},

		// ---- single-choice dropdowns (format, audience) ----

		populateChoiceSelect: function(field) {
			var select = this.$('.' + field + 'Select').get(0);
			if(!select || !CHOICES[field]) { return; }
			var current = this.model.get(field) || '';
			// Drop a value that isn't one of this list's options (e.g. left
			// over in a saved patch, or from an earlier build) so it can't
			// keep leaking into the assembled prompt while the dropdown
			// shows "(default)".
			var known = _.some(CHOICES[field], function(opt) { return opt[0] === current; });
			if(!known) { current = ''; this.model.set(field, ''); }
			select.innerHTML = '';
			CHOICES[field].forEach(function(opt) {
				select.appendChild(new Option(opt[1], opt[0]));
			});
			select.value = current;
			this.$('.' + field + 'Custom').toggle(current === 'other');
		},

		choiceSelectChange: function(e) {
			var field = $(e.currentTarget).data('field');
			var v = $(e.currentTarget).val();
			this.model.set(field, v);
			this.$('.' + field + 'Custom').toggle(v === 'other');
		},

		// ---- random / reset personality ----

		// Redraw the JS-populated selects and the plain-DOM slider after a
		// bulk model.set (rivets keeps mode/length/systemAppend in sync on
		// its own).
		syncPersonalityUI: function() {
			this.populateTraitSelects();
			this.populateChoiceSelect('format');
			this.populateChoiceSelect('audience');
			this.updateTempRange();
		},

		// Randomise only the traits and temperature - purpose and audience
		// are left alone (they're task-specific, not a "personality").
		randomPersonality: function() {
			var shuffled = _.shuffle(_.without(TRAITS, 'none'));
			var count = 2 + Math.floor(Math.random() * 3); // 2..4 traits
			var set = {};
			for(var i = 1; i <= 4; i++) {
				set['trait' + i] = i <= count ? shuffled[i - 1] : 'none';
				set['trait' + i + 'Custom'] = '';
			}
			var max = this.model.get('provider') === 'anthropic' ? 1 : 2;
			set.temperature = Math.round((0.2 + Math.random() * (max - 0.2)) * 10) / 10;
			this.model.set(set);
			this.syncPersonalityUI();
		},

		resetPersonality: function() {
			var set = {
				format: '', formatCustom: '',
				audience: '', audienceCustom: '',
				length: '', temperature: 0.7, systemAppend: '',
			};
			for(var i = 1; i <= 4; i++) {
				set['trait' + i] = 'none';
				set['trait' + i + 'Custom'] = '';
			}
			this.model.set(set);
			this.syncPersonalityUI();
		},

		refreshKeyStatus: function() {
			if(app.server || !window.ntkElectron || !window.ntkElectron.llmKeyStatus) { return; }
			var self = this;
			window.ntkElectron.llmKeyStatus(this.model.get('provider')).then(function(s) {
				if(!s) { return; }
				if(self.model.get('provider') === 'ollama') {
					self.model.set('keyText', 'local — no key needed');
				} else if(s.hasKey) {
					self.model.set('keyText', 'key found (' + s.source + ')');
				} else {
					self.model.set('keyText', 'no key — click "set up key"');
				}
			});
		},

		openKeysFile: function() {
			if(window.ntkElectron && window.ntkElectron.llmOpenKeysFile) {
				window.ntkElectron.llmOpenKeysFile().then(this.refreshKeyStatus.bind(this));
			}
		},

		// ---- send ----

		parsedTemp: function() {
			var t = parseFloat(this.model.get('temperature'));
			return isNaN(t) ? undefined : t;
		},

		send: function() {
			if(app.server) { return; }
			if(this.model.get('status') === 'calling') { return; }
			if(!window.ntkElectron || !window.ntkElectron.llmComplete) {
				this.setStatus('error', 'Needs the desktop app');
				return;
			}
			var user = String(this.model.get('in') || '').trim();
			if(!user) { this.setStatus('error', 'no prompt'); return; }
			var model = String(this.model.get('model') || '').trim();
			if(!model) { this.setStatus('error', 'pick a model'); return; }

			// Always send a freshly assembled prompt rather than trusting
			// the cached display copy.
			var system = this.assembleSystem();
			this.model.set('assembledSystem', system);

			var self = this;
			this.setStatus('calling', '');
			window.ntkElectron.llmComplete({
				provider: this.model.get('provider'),
				model: model,
				baseURL: this.model.get('baseURL') || undefined,
				system: system || undefined,
				user: user,
				temperature: this.parsedTemp(),
				maxTokens: parseInt(this.model.get('maxTokens'), 10) || 1024,
			}).then(function(res) {
				if(!res || res.error) {
					self.setStatus('error', (res && res.error) || 'failed');
					return;
				}
				var text = res.text || '';
				self.model.set({
					output: text,
					preview: text.length > 140 ? text.slice(0, 140) + '…' : text,
				});
				self.setStatus('idle', res.tempDropped ? 'this model ignores temperature' : '');
			});
		},

		setStatus: function(status, text) {
			this.model.set({status: status, calling: status === 'calling', statusText: text || ''});
		},

		// ---- model changes ----

		onModelChange: function(model) {
			if(app.server) { return; }
			var changed = model.changedAttributes();
			if(!changed) { return; }

			// Keep the assembled-prompt display in sync. Recompute on any
			// change except the widget's own bookkeeping fields (which
			// includes assembledSystem itself, to avoid a set loop).
			var onlyBookkeeping = _.every(_.keys(changed), function(k) {
				return k === 'assembledSystem' || k === 'output' || k === 'preview' ||
					k === 'status' || k === 'calling' || k === 'statusText' ||
					k === 'keyText' || k === 'model' || k === 'in';
			});
			if(!onlyBookkeeping) {
				var sys = this.assembleSystem();
				if(sys !== this.model.get('assembledSystem')) {
					this.model.set('assembledSystem', sys);
				}
			}

			// A patch load sets `provider` via model.set (not the DOM
			// change event), so the provider-dependent controls have to be
			// re-synced here rather than only in onProviderChange.
			if(changed.provider !== undefined) {
				this.resetModelList();
				this.updateTempRange();
				this.populateModelSelect();
				this.refreshKeyStatus();
				this.fetchModels();
			}

			// Auto-send on a new prompt (debounced, off by default).
			if(changed.in !== undefined && this.model.get('autoSend')) {
				var self = this;
				if(this._sendTimer) { clearTimeout(this._sendTimer); }
				this._sendTimer = setTimeout(function() { self.send(); }, 600);
			}
		},

	});
});
