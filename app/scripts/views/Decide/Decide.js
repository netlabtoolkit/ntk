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
			});

			this.loadScript();
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
			this.nameOutlets();
			this.renderGutter();
			if(!window.ntkElectron || !window.ntkElectron.decide) {
				this.setStatus('needs the desktop app', '', true);
				return;
			}
			this.fetchModels();
		},

		onRemove: function() {
			if(this._pauseTimer) { clearTimeout(this._pauseTimer); }
			if(this._warmTimer) { clearTimeout(this._warmTimer); }
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

		checkScript: function(e) {
			this.gutterText = e.target.value;
			this.showErrors(DecideScript.parse(e.target.value));
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

		// ---- model changes ----

		onModelChange: function(model) {
			var changed = model.changedAttributes();
			if(!changed) { return; }

			if(changed.script !== undefined) {
				this.loadScript();
				this.scheduleWarm();
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
