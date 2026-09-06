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

	// BCP-47 locales for the "more" panel dropdown. Apple's actual
	// supported set is SFSpeechRecognizer.supportedLocales() and which are
	// available on-device depends on the user's downloaded dictation
	// languages - this is just a common shortlist; the free-text field
	// below it accepts any BCP-47 id.
	var LOCALES = [
		['English (US)', 'en-US'],
		['English (UK)', 'en-GB'],
		['Spanish (Spain)', 'es-ES'],
		['Spanish (Mexico)', 'es-MX'],
		['French', 'fr-FR'],
		['German', 'de-DE'],
		['Italian', 'it-IT'],
		['Portuguese (Brazil)', 'pt-BR'],
		['Japanese', 'ja-JP'],
		['Chinese (Simplified)', 'zh-CN'],
		['Korean', 'ko-KR'],
		['Russian', 'ru-RU'],
		['Arabic', 'ar-SA'],
		['Hindi', 'hi-IN'],
	];

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
			'change .localeInput': 'localeInputChange',
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
				recording: false,
				status: 'idle',   // idle | recording | transcribing | error | unavailable
				statusText: '',
			});
		},

		onRender: function() {
			WidgetView.prototype.onRender.call(this);

			if(app.server) { return; }

			var self = this;
			this.$('.recordButton').css('cursor', 'pointer');

			this.populateLocaleSelect();

			var ntkElectron = window.ntkElectron;
			if(!ntkElectron || !ntkElectron.speechAvailable) {
				this.setStatus('unavailable', 'Needs the desktop app');
				return;
			}

			ntkElectron.speechAvailable().then(function(ok) {
				if(!ok) {
					self.setStatus('unavailable', 'macOS only');
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
			this.model.set({recording: true, partial: ''});
			this.setStatus('recording', '');
			window.ntkElectron.speechStart(this.model.get('wid'), this.model.get('locale'))
				.then(function(ok) {
					if(!ok && self.model.get('recording')) {
						self.model.set('recording', false);
						self.setStatus('error', 'could not start');
					}
				});
		},

		stopRecording: function() {
			if(app.server || !this.model.get('recording')) { return; }
			this.model.set('recording', false);
			this.setStatus('transcribing', '');
			if(window.ntkElectron && window.ntkElectron.speechStop) {
				window.ntkElectron.speechStop(this.model.get('wid'));
			}
		},

		onSpeechMessage: function(msg) {
			switch(msg.type) {
				case 'listening':
					this.setStatus('recording', '');
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
					this.model.set('recording', false);
					this.setStatus('idle', '');
					break;
				case 'error':
					this.model.set('recording', false);
					this.setStatus('error', msg.message || 'error');
					break;
			}
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

		// ---- locale UI ----

		populateLocaleSelect: function() {
			var select = this.$('.localeSelect').get(0);
			if(!select) { return; }
			select.innerHTML = '';
			var current = this.model.get('locale'), matched = false;
			for(var i = 0; i < LOCALES.length; i++) {
				var opt = new Option(LOCALES[i][0], LOCALES[i][1]);
				select.options[i] = opt;
				if(LOCALES[i][1] === current) { matched = true; }
			}
			select.options[LOCALES.length] = new Option('Other…', '__other__');
			if(matched) {
				select.value = current;
				this.$('.localeInput').hide();
			} else {
				select.value = '__other__';
				this.$('.localeInput').val(current).show();
			}
		},
		localeSelectChange: function() {
			var val = this.$('.localeSelect').val();
			if(val === '__other__') {
				this.$('.localeInput').val(this.model.get('locale')).show();
			} else {
				this.$('.localeInput').hide();
				this.model.set('locale', val);
			}
		},
		localeInputChange: function() {
			var val = this.$('.localeInput').val().trim();
			if(val) { this.model.set('locale', val); }
		},

	});
});
