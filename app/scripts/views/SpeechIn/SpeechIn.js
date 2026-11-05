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

	// done stays at 1023 this long - long enough to see, like SpeechOut's.
	var DONE_MS = 200;
	// Started and released with nothing said yet: stop listening if
	// still nothing has been heard after this long.
	var NO_SPEECH_MS = 10000;

	return WidgetView.extend({
		// start / done are header ports (plans/control-flow.md). start
		// is the old 'trigger' inlet (same field): rising past the
		// threshold starts listening. Held, it listens until it goes
		// low, as before; released before anything was said (a pulse,
		// e.g. SpeechOut's done, or a click on the button), it listens
		// until the speaker pauses. done pulses when a transcript with
		// words arrives, just after the text outlet changes.
		ins: [
			{title: 'start', to: 'in1', header: true},
		],
		outs: [
			{title: 'done', from: 'done', to: 'out2', header: true},
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

			// Listening state, read by onModelChange (which the set below
			// already fires) and onSpeechMessage.
			this.startHeld = false;    // start high, or the button held down
			this.heardSpeech = false;  // words recognised since listening began
			this.quietTimer = null;
			this.noSpeechTimer = null;
			this.doneTimer = null;

			this.model.set({
				title: 'SpeechIn',
				in1: 0,
				output: '',       // the outlet - last completed transcription, kept
				partial: '',      // live in-progress text, body preview only
				threshold: 512,
				lastIn: -1,
				done: 0,
				pauseSeconds: 1.5, // a pause this long ends listening that start didn't hold open
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
			this.clearListenTimers();
			clearTimeout(this.doneTimer);
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
				this.pressStart();
			} else if(lastIn >= threshold && input < threshold) {
				this.releaseStart();
			}
			this.model.set('lastIn', input);
		},

		// ---- start: held, or a pulse ----

		/**
		 * pressStart / releaseStart - start rising and falling, from the
		 * start port or the record button. Released after something was
		 * said, listening stops at once (hold to talk). Released before
		 * - a pulse, or a quick click - it carries on until the speaker
		 * pauses (pauseSeconds), or until NO_SPEECH_MS pass in silence.
		 *
		 * @return {void}
		 */
		pressStart: function() {
			this.startHeld = true;
			this.startRecording();
		},
		releaseStart: function() {
			this.startHeld = false;
			if(!this.model.get('recording')) { return; }
			if(this.heardSpeech) { this.stopRecording(); }
			else { this.armQuietTimer(); }
		},

		// While start isn't holding listening open, each new bit of
		// recognised speech restarts the pause countdown.
		armQuietTimer: function() {
			var self = this;
			clearTimeout(this.quietTimer);
			if(this.startHeld || !this.heardSpeech) { return; }
			var pauseMs = (parseFloat(this.model.get('pauseSeconds')) || 1.5) * 1000;
			this.quietTimer = setTimeout(function() { self.stopRecording(); }, pauseMs);
		},

		clearListenTimers: function() {
			clearTimeout(this.quietTimer);
			clearTimeout(this.noSpeechTimer);
			this.quietTimer = this.noSpeechTimer = null;
		},

		/**
		 * pulseDone - done goes to 1023 and back to 0 after DONE_MS.
		 *
		 * @return {void}
		 */
		pulseDone: function() {
			var self = this;
			clearTimeout(this.doneTimer);
			this.model.set('done', 1023);
			this.doneTimer = setTimeout(function() { self.model.set('done', 0); }, DONE_MS);
		},

		// ---- recording control (single entry points) ----

		startRecording: function() {
			if(app.server || this.model.get('recording')) { return; }
			if(this.model.get('status') === 'unavailable') { return; }
			if(!window.ntkElectron || !window.ntkElectron.speechStart) { return; }

			var self = this;
			this.heardSpeech = false;
			this.clearListenTimers();
			this.noSpeechTimer = setTimeout(function() {
				if(!self.heardSpeech && !self.startHeld) { self.stopRecording(); }
			}, NO_SPEECH_MS);
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
			this.clearListenTimers();
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
					if(msg.text) {
						this.heardSpeech = true;
						this.armQuietTimer();
					}
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
					this.clearListenTimers();
					// After the text, so whatever done starts sees it.
					if(msg.text) { this.pulseDone(); }
					break;
				case 'error':
					this.clearListenTimers();
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

		// The button is start by hand: hold to talk, or click and speak.
		// mouseleave also releases, so only act on a press made here.
		recordButtonDown: function() {
			this.buttonDown = true;
			this.pressStart();
		},
		recordButtonUp: function() {
			if(!this.buttonDown) { return; }
			this.buttonDown = false;
			this.releaseStart();
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
