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

	// Preferred default when its voice is installed (System Settings ->
	// Accessibility -> Spoken Content -> System Voice -> Manage Voices).
	var PREFERRED_APPLE_VOICE = 'com.apple.voice.premium.en-US.Zoe';
	var QUALITY_ORDER = { premium: 0, enhanced: 1, 'default': 2 };
	var QUALITY_LABEL = { premium: 'Premium', enhanced: 'Enhanced', 'default': 'Default' };

	return WidgetView.extend({
		ins: [
			{title: 'trigger', to: 'in1'},
			{title: 'text', to: 'in2'},
		],
		outs: [
			{title: 'out1', from: 'output', to: 'out1'},
		],

		widgetEvents: {
			'click .playButton': 'playButtonClick',
			'change .voice': 'voiceChange',
		},
		sources: [],
		typeID: 'SpeechOut',
		className: 'speechout',
		categories: ['AI'],
		template: _.template(Template),

		initialize: function(options) {
			WidgetView.prototype.initialize.call(this, options);

			this.model.set({
				title: 'SpeechOut',
				in1: 0,
				in2: 'Hello world, this is a test',
				voice: PREFERRED_APPLE_VOICE,
				rate: 0.5,
				engine: '',        // 'apple' | 'web'
				speaking: false,
				lang: 'en-US',
				dialect: 'en-US',
				language: 6,
				threshold: 512,
				autoPlay: true,
				autoCancel: false,
				lastIn: -1,
				domReady: false,
			});
		},

		onRender: function() {
			WidgetView.prototype.onRender.call(this);
			if(app.server) { this.model.set('domReady', true); return; }

			var self = this;
			this.$('.playButton').css('cursor', 'pointer');
			this.voiceSelect = this.$('.voice').get(0);

			var ntkElectron = window.ntkElectron;
			if(ntkElectron && ntkElectron.ttsAvailable) {
				ntkElectron.ttsAvailable().then(function(ok) {
					if(ok) { self.setupAppleEngine(); }
					else { self.setupWebEngine(); }
				});
			} else {
				this.setupWebEngine();
			}

			this.model.set('domReady', true);
		},

		onRemove: function() {
			if(this.unsubscribeTts) { this.unsubscribeTts(); }
			if(window.ntkElectron && window.ntkElectron.ttsQuit) {
				window.ntkElectron.ttsQuit(this.model.get('wid'));
			}
			if(this.engine === 'web' && window.speechSynthesis) { window.speechSynthesis.cancel(); }
		},

		// ---- Apple AVSpeechSynthesizer engine ----

		setupAppleEngine: function() {
			var self = this;
			this.engine = 'apple';
			this.model.set('engine', 'apple');

			this.unsubscribeTts = window.ntkElectron.onTtsResult(function(msg) {
				if(msg.wid !== self.model.get('wid')) { return; }
				if(msg.type === 'started') { self.model.set('speaking', true); }
				else if(msg.type === 'done') { self.model.set('speaking', false); }
				else if(msg.type === 'error') { self.model.set({speaking: false, statusText: msg.message || 'error'}); }
			});

			window.ntkElectron.ttsVoices().then(function(voices) {
				self.appleVoices = voices || [];
				self.populateAppleVoices();
			});
		},

		populateAppleVoices: function() {
			var select = this.voiceSelect;
			if(!select) { return; }
			select.innerHTML = '';

			var voices = (this.appleVoices || []).slice().sort(function(a, b) {
				var q = (QUALITY_ORDER[a.quality] || 9) - (QUALITY_ORDER[b.quality] || 9);
				if(q) { return q; }
				var ae = a.lang.indexOf('en') === 0, be = b.lang.indexOf('en') === 0;
				if(ae !== be) { return ae ? -1 : 1; }
				if(a.lang !== b.lang) { return a.lang < b.lang ? -1 : 1; }
				return a.name < b.name ? -1 : 1;
			});

			var groups = {}, order = [];
			voices.forEach(function(v) {
				if(!groups[v.quality]) { groups[v.quality] = document.createElement('optgroup'); groups[v.quality].label = QUALITY_LABEL[v.quality] || v.quality; order.push(v.quality); }
				var opt = new Option(v.name + '  —  ' + v.lang, v.id);
				groups[v.quality].appendChild(opt);
			});
			['premium', 'enhanced', 'default'].forEach(function(q) { if(groups[q]) { select.appendChild(groups[q]); } });
			order.forEach(function(q) { if(['premium','enhanced','default'].indexOf(q) === -1 && groups[q]) { select.appendChild(groups[q]); } });

			// Pick a default the widget's saved value, else the preferred
			// voice, else best available.
			var want = this.model.get('voice');
			var ids = voices.map(function(v) { return v.id; });
			var pick = ids.indexOf(want) !== -1 ? want
				: ids.indexOf(PREFERRED_APPLE_VOICE) !== -1 ? PREFERRED_APPLE_VOICE
				: (voices[0] && voices[0].id) || '';
			select.value = pick;
			this.model.set('voice', pick);

			if(!voices.some(function(v) { return v.quality === 'premium' || v.quality === 'enhanced'; })) {
				this.model.set('statusText', 'Tip: download Premium voices in System Settings');
			}
		},

		// ---- browser speechSynthesis engine (Windows/Linux fallback) ----

		setupWebEngine: function() {
			var self = this;
			this.engine = 'web';
			this.model.set('engine', 'web');

			if(!('speechSynthesis' in window)) {
				this.model.set('statusText', 'no speech synthesis available');
				return;
			}
			this.msg = new SpeechSynthesisUtterance();
			this.msg.volume = 1;
			this.msg.lang = 'en-US';
			this.msg.onstart = function() { self.model.set('speaking', true); };
			this.msg.onend = function() { self.model.set('speaking', false); };
			this.msg.onerror = function() { self.model.set('speaking', false); };

			this.webVoiceLangs = {};
			this.loadWebVoices();
			window.speechSynthesis.onvoiceschanged = function() { self.loadWebVoices(); };
		},

		loadWebVoices: function() {
			var self = this, select = this.voiceSelect;
			if(!select) { return; }
			var voices = window.speechSynthesis.getVoices();
			if(!voices.length) { return; }
			select.innerHTML = '';
			voices.forEach(function(v) {
				self.webVoiceLangs[v.name] = v.lang;
				select.appendChild(new Option(v.name + '  —  ' + v.lang, v.name));
			});
			// Web mode: model.voice may hold an Apple id from a Mac-made
			// patch - fall back to Samantha / first voice.
			var names = voices.map(function(v) { return v.name; });
			var want = this.model.get('voice');
			var pick = names.indexOf(want) !== -1 ? want
				: names.indexOf('Samantha') !== -1 ? 'Samantha'
				: names[0];
			select.value = pick;
			this.model.set('voice', pick);
		},

		// ---- speak / stop (engine-agnostic entry points) ----

		speak: function() {
			if(app.server) { return; }
			var text = String(this.model.get('in2') || '');
			if(!text.trim()) { return; }

			if(this.engine === 'apple') {
				window.ntkElectron.ttsSpeak(this.model.get('wid'), {
					text: text,
					voice: this.model.get('voice'),
					rate: parseFloat(this.model.get('rate')) || 0.5,
				});
				this.model.set('speaking', true);
			} else if(this.engine === 'web' && this.msg) {
				window.speechSynthesis.cancel();
				this.msg.text = text;
				this.msg.rate = (parseFloat(this.model.get('rate')) || 0.5) * 2; // web rate 0.1..10, ~1 = normal
				var voices = window.speechSynthesis.getVoices();
				var v = voices.filter(function(x) { return x.name === this.model.get('voice'); }.bind(this))[0];
				if(v) { this.msg.voice = v; this.msg.lang = v.lang; }
				window.speechSynthesis.speak(this.msg);
			}
		},

		stop: function() {
			if(this.engine === 'apple') {
				if(window.ntkElectron) { window.ntkElectron.ttsStop(this.model.get('wid')); }
			} else if(window.speechSynthesis) {
				window.speechSynthesis.cancel();
			}
			this.model.set('speaking', false);
		},

		// ---- UI + inlets ----

		playButtonClick: function() {
			if(this.model.get('speaking')) { this.stop(); }
			else { this.speak(); }
		},

		voiceChange: function() {
			this.model.set('voice', this.$('.voice').val());
		},

		onModelChange: function(model) {
			if(app.server || !this.model.get('domReady')) { return; }
			var changed = model.changedAttributes();
			if(!changed) { return; }

			if(changed.in1 !== undefined) {
				var input = parseFloat(this.model.get('in1')),
					threshold = parseFloat(this.model.get('threshold')),
					lastIn = parseFloat(this.model.get('lastIn'));
				if(lastIn < threshold && input >= threshold) {
					this.speak();
				} else if(lastIn >= threshold && input < threshold) {
					if(this.model.get('autoCancel')) { this.stop(); }
				}
				this.model.set('lastIn', input);
			}
			if(changed.in2 !== undefined && this.model.get('autoPlay')) {
				this.speak();
			}
		},

	});
});
