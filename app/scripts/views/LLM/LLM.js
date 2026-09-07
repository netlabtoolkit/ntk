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
	};

	// Personality-trait options for each of the 4 trait dropdowns.
	// 'none' = skip, 'other' = use the adjacent free-text field.
	var TRAITS = ['none', 'humor', 'sarcasm', 'professionalism', 'scientific',
		'speculation', 'metaphorical', 'creativity', 'business', 'conversational',
		'clarity', 'accuracy', 'conciseness', 'verbosity', 'originality',
		'playfulness', 'eloquence', 'political', 'angry', 'kind', 'liberal',
		'centrist', 'conservative', 'persuasive', 'sales', 'confident', 'unsure',
		'tentative'];

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
			'change .modelInput': 'onModelInputChange',
			'click .refreshModels': 'fetchModels',
			'click .setupKey': 'openKeysFile',
			'change .traitSelect': 'traitSelectChange',
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
			this.modelList = FALLBACK_MODELS.anthropic.slice();

			this.model.set({
				title: 'LLM',
				in: '',            // the prompt (inlet or the text box)
				output: '',        // the outlet - last response, kept
				preview: '',       // truncated last response for the body

				mode: 'answer',
				provider: 'anthropic',
				model: DEFAULT_MODEL.anthropic,
				baseURL: '',

				temperature: '',   // '' -> not sent
				length: '',        // '' -> no length clause; words, or % for rewrite

				// 4 trait dropdowns + a free-text field each (used when
				// the dropdown is set to 'other').
				trait1: 'none', trait1Custom: '',
				trait2: 'none', trait2Custom: '',
				trait3: 'none', trait3Custom: '',
				trait4: 'none', trait4Custom: '',

				format: '',
				audience: '',
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

			this.populateModelSelect();
			this.populateTraitSelects();
			this.refreshKeyStatus();
			this.fetchModels();
		},

		onRemove: function() {
			if(this._sendTimer) { clearTimeout(this._sendTimer); }
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

		assembleSystem: function() {
			var m = this.model;
			var mode = m.get('mode') || 'answer';
			var traits = this.effectiveTraits();
			var parts = [
				MODE_PREAMBLE[mode] || MODE_PREAMBLE.answer,
				traits.length && ('Write with these qualities: ' + traits.join(', ') + '.'),
				m.get('format')   && ('Format the output as: ' + m.get('format') + '.'),
				m.get('audience') && ('Write for this audience: ' + m.get('audience') + '.'),
				this.lengthClause(mode, parseInt(m.get('length'), 10)),
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
			this.modelList = (FALLBACK_MODELS[provider] || []).slice();
			this.populateModelSelect();
			this.refreshKeyStatus();
			this.fetchModels();
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
			if(current && list.indexOf(current) === -1) { list.unshift(current); }

			select.innerHTML = '';
			list.forEach(function(id) { select.appendChild(new Option(id, id)); });
			if(list.length) {
				select.value = list.indexOf(current) !== -1 ? current : list[0];
				this.model.set('model', select.value);
			}
			// keep the free-text field in sync
			this.$('.modelInput').val(this.model.get('model') || '');
		},

		onModelSelectChange: function() {
			var v = this.$('.modelSelect').val();
			this.model.set('model', v);
			this.$('.modelInput').val(v);
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
		onModelInputChange: function() {
			var v = this.$('.modelInput').val().trim();
			if(v) {
				this.model.set('model', v);
				this.populateModelSelect();
			}
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

			var self = this;
			this.setStatus('calling', '');
			window.ntkElectron.llmComplete({
				provider: this.model.get('provider'),
				model: model,
				baseURL: this.model.get('baseURL') || undefined,
				system: this.model.get('assembledSystem') || undefined,
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

			// Rebuild the system prompt when any structured field changes.
			var structural = _.some(_.keys(changed), function(k) {
				return k === 'mode' || k === 'format' || k === 'audience' ||
					k === 'length' || k === 'systemAppend' || k.indexOf('trait') === 0;
			});
			if(structural) {
				var sys = this.assembleSystem();
				if(sys !== this.model.get('assembledSystem')) {
					this.model.set('assembledSystem', sys);
				}
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
