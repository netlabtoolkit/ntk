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

	// The common shortlist - pinned to the top of the dropdown in this
	// order, and used on its own as a fallback before the helper reports
	// the full SFSpeechRecognizer.supportedLocales() set (~63 ids).
	var COMMON_LOCALES = ['en-US', 'en-GB', 'es-ES', 'es-MX', 'fr-FR', 'de-DE',
		'it-IT', 'pt-BR', 'ja-JP', 'zh-CN', 'ko-KR', 'ru-RU', 'ar-SA', 'hi-IN'];

	// Prettify a BCP-47 id using the browser's own locale data.
	var displayNames = (typeof Intl !== 'undefined' && Intl.DisplayNames)
		? new Intl.DisplayNames(['en'], { type: 'language' }) : null;
	function localeLabel(id) {
		if(!displayNames) { return id; }
		try {
			var parts = id.split('-');
			var lang = displayNames.of(parts[0]);
			var region = parts[1] && parts[1].length === 2
				? new Intl.DisplayNames(['en'], { type: 'region' }).of(parts[1]) : null;
			return region ? lang + ' (' + region + ')  —  ' + id : lang + '  —  ' + id;
		} catch(e) { return id; }
	}

	return WidgetView.extend({
		ins: [
			{title: 'trigger', to: 'in1'},
		],
		outs: [
			{title: 'text', from: 'output', to: 'out1'},
		],

		widgetEvents: {
			'mousedown .recordButton': 'recordButtonDown',
			'mouseup .recordButton': 'recordButtonUp',
			'mouseleave .recordButton': 'recordButtonUp',
			'change .localeSelect': 'localeSelectChange',
		},
		sources: [],
		typeID: 'SpeechIn',
		className: 'speechin',
		categories: ['AI'],
		template: _.template(Template),

		initialize: function(options) {
			WidgetView.prototype.initialize.call(this, options);

			this.model.set({
				title: 'SpeechIn',
				in1: 0,
				output: '',       // the outlet - last completed transcription, kept
				partial: '',      // live in-progress text, body preview only
				threshold: 512,
				lastIn: -1,
				locale: 'en-US',
				recording: false, // button held / trigger high (the helper has been asked to listen)
				live: false,      // the helper has confirmed the mic is actually open
				status: 'idle',   // idle | starting | recording | transcribing | error | unavailable
				statusText: '',
			});
		},

		onRender: function() {
			WidgetView.prototype.onRender.call(this);

			if(app.server) { return; }

			var self = this;
			this.$('.recordButton').css('cursor', 'pointer');

			this.availableLocales = COMMON_LOCALES.slice();
			this.populateLocaleSelect();

			var ntkElectron = window.ntkElectron;
			if(!ntkElectron || !ntkElectron.speechAvailable) {
				this.setStatus('unavailable', 'Needs the desktop app');
				return;
			}

			ntkElectron.speechAvailable().then(function(ok) {
				if(!ok) {
					self.setStatus('unavailable', 'macOS only');
					return;
				}
				self.warmHelper();
				if(ntkElectron.speechLocales) {
					ntkElectron.speechLocales().then(function(locales) {
						if(Array.isArray(locales) && locales.length) {
							self.availableLocales = locales;
							self.populateLocaleSelect();
						}
					});
				}
			});

			// Route helper messages for this widget only.
			this.unsubscribeSpeech = ntkElectron.onSpeechResult(function(msg) {
				if(msg.wid !== self.model.get('wid')) { return; }
				self.onSpeechMessage(msg);
			});
		},

		onRemove: function() {
			if(this.unsubscribeSpeech) { this.unsubscribeSpeech(); }
			if(window.ntkElectron && window.ntkElectron.speechQuit) {
				window.ntkElectron.speechQuit(this.model.get('wid'));
			}
		},

		onModelChange: function(model) {
			var changed = model.changedAttributes();
			if(!changed || changed.in1 === undefined) { return; }

			var input = parseFloat(this.model.get('in1')),
				threshold = parseFloat(this.model.get('threshold')),
				lastIn = parseFloat(this.model.get('lastIn'));

			if(lastIn < threshold && input >= threshold) {
				this.startRecording();
			} else if(lastIn >= threshold && input < threshold) {
				this.stopRecording();
			}
			this.model.set('lastIn', input);
		},

		// ---- recording control (single entry points) ----

		startRecording: function() {
			if(app.server || this.model.get('recording')) { return; }
			if(this.model.get('status') === 'unavailable') { return; }
			if(!window.ntkElectron || !window.ntkElectron.speechStart) { return; }

			var self = this;
			// 'starting' until the helper reports 'listening' (see
			// onSpeechMessage) - the mic takes a moment to open, and
			// showing 'recording' straight away invited talking into a
			// mic that wasn't live yet, losing the first words.
			this.model.set({recording: true, live: false, partial: ''});
			this.setStatus('starting', '');
			window.ntkElectron.speechStart(this.model.get('wid'), this.model.get('locale'))
				.then(function(ok) {
					if(!ok && self.model.get('recording')) {
						self.model.set({recording: false, live: false});
						self.setStatus('error', 'could not start');
					}
				});
		},

		stopRecording: function() {
			if(app.server || !this.model.get('recording')) { return; }
			this.model.set({recording: false, live: false});
			this.setStatus('transcribing', '');
			if(window.ntkElectron && window.ntkElectron.speechStop) {
				window.ntkElectron.speechStop(this.model.get('wid'));
			}
		},

		onSpeechMessage: function(msg) {
			switch(msg.type) {
				case 'locales':
					if(Array.isArray(msg.locales) && msg.locales.length) {
						this.availableLocales = msg.locales;
						this.populateLocaleSelect();
					}
					break;
				case 'listening':
					// Ignore one that lands after the button was already
					// released (status has moved on to 'transcribing').
					if(this.model.get('recording')) {
						this.model.set('live', true);
						this.setStatus('recording', '');
					}
					break;
				case 'partial':
					this.model.set('partial', msg.text || '');
					break;
				case 'final':
					this.model.set('partial', '');
					// Only push a non-empty result; keep the last one otherwise
					// so downstream widgets don't get cleared on a silent stop.
					if(msg.text) {
						this.model.set('output', msg.text);
					}
					this.model.set({recording: false, live: false});
					this.setStatus('idle', '');
					break;
				case 'error':
					this.model.set({recording: false, live: false});
					this.setStatus('error', msg.message || 'error');
					break;
			}
		},

		// Launch this widget's helper and have it build the recognizer for
		// the current locale before the first press, so that press only
		// has to open the mic. Opens no mic and raises no permission
		// prompt (see `warm` in speechhelper.swift).
		warmHelper: function() {
			if(app.server || !window.ntkElectron || !window.ntkElectron.speechWarm) { return; }
			if(this.model.get('status') === 'unavailable' || this.model.get('recording')) { return; }
			window.ntkElectron.speechWarm(this.model.get('wid'), this.model.get('locale'));
		},

		setStatus: function(status, text) {
			this.model.set({status: status, statusText: text || ''});
		},

		// ---- record button ----

		recordButtonDown: function() {
			this.startRecording();
		},
		recordButtonUp: function() {
			this.stopRecording();
		},

		// ---- locale dropdown (populated from the helper's supported set) ----

		populateLocaleSelect: function() {
			var select = this.$('.localeSelect').get(0);
			if(!select) { return; }

			var current = this.model.get('locale');
			var available = this.availableLocales;

			// "Common" group: the shortlist, in its fixed order, limited to
			// what the helper actually supports.
			var common = COMMON_LOCALES.filter(function(id) { return available.indexOf(id) !== -1; });
			// "All other languages" group: everything else, alphabetical by
			// display name.
			var rest = available
				.filter(function(id) { return common.indexOf(id) === -1; })
				.sort(function(a, b) {
					var la = localeLabel(a), lb = localeLabel(b);
					return la < lb ? -1 : (la > lb ? 1 : 0);
				});
			// A saved patch could hold a locale this build's helper doesn't
			// list (a different macOS version) - keep it selectable.
			if(current && available.indexOf(current) === -1) { common.unshift(current); }

			select.innerHTML = '';
			var gCommon = document.createElement('optgroup');
			gCommon.label = 'Common';
			common.forEach(function(id) { gCommon.appendChild(new Option(localeLabel(id), id)); });
			select.appendChild(gCommon);

			if(rest.length) {
				var gRest = document.createElement('optgroup');
				gRest.label = 'All other languages';
				rest.forEach(function(id) { gRest.appendChild(new Option(localeLabel(id), id)); });
				select.appendChild(gRest);
			}

			var all = common.concat(rest);
			select.value = all.indexOf(current) !== -1 ? current : all[0];
			this.model.set('locale', select.value);
		},

		localeSelectChange: function() {
			this.model.set('locale', this.$('.localeSelect').val());
			this.warmHelper();
		},

	});
});
