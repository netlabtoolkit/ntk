define([
		'backbone',
		'rivets',
		'views/item/WidgetMulti',
		'text!./template.js',
	],
	function(Backbone, rivets, WidgetView, Template) {
		'use strict';

		// done stays at 1023 this long - long enough to see, like SpeechOut's.
		var DONE_MS = 200;

		return WidgetView.extend({
			// start / done are header ports (plans/control-flow.md). start
			// plays the clip from the beginning when it rises past the
			// threshold and keeps playing when it falls, so a done pulse
			// from another widget can start it; Play stays in the body and
			// still plays only while held high. done pulses 1023 for
			// DONE_MS when the clip plays to its end (never with loop on).
			ins: [
				{title: 'trigger', to: 'start', header: true},
				{title: 'Play', to: 'play'},
				{title: 'Volume', to: 'volume'},
				{title: 'Speed', to: 'speed'},
			],
			outs: [
				{title: 'next', from: 'done', to: 'out1', header: true},
			],
			typeID: 'Audio',
			categories: ['media'],
			className: 'audio',
			template: _.template(Template),
			sources: [],
			widgetEvents: {
				'change .loop': 'loopChange',
				'change .continuous': 'continuousChange',
				'change .srcFile': 'srcFileChange',
				'click .browseAudio': 'browseAudio',
				'click .playToggle': 'togglePlay',
			},

			initialize: function(options) {
				WidgetView.prototype.initialize.call(this, options);

				// Read by onModelChange, which the set below already fires.
				this.lastStart = 0;
				this.doneTimer = null;

				this.model.set({
					src: 'assets/audio/song_part5.wav',
					srcFile: 'song_part5.wav',
					localAudioPath: null,
					title: 'Audio',

					start: 0,
					done: 0,
					play: 0,
					playText: "Pause",
					// Whether the audio element is actually playing right
					// now - drives the play/pause button's look. Kept in
					// step by the element's own events (see onRender).
					isPlaying: false,
					toggle: 0,
					volume: 100.0,
					speed: 100.0,
					loop: false,
					continuous: false,
					threshold: 512,
				});

				this.playing = false;

				this.domReady = false;

			},

			onRender: function() {
				WidgetView.prototype.onRender.call(this);
				var self = this;
				if (!app.server) {
					// Same as Video.js: the button, and this.playing (which
					// the Play inlet's threshold logic reads), follow what
					// the element is really doing - including a clip that
					// ran out with loop off, which used to still count as
					// playing.
					var audioEl = this.$(".audio")[0];
					audioEl.addEventListener('play', function() { self.setPlayingState(true); });
					audioEl.addEventListener('pause', function() { self.setPlayingState(false); });
					audioEl.addEventListener('ended', function() {
						self.setPlayingState(false);
						self.pulseDone();
					});

					this.$(".audio")[0].loop = this.model.get('loop');
					if (this.model.get('continuous')) {
						this.playing = true;
						this.$(".audio")[0].play();
						this.model.set('playText', "Play");
					}
					this.domReady = true;
				}
			},

			onRemove: function() {
				clearTimeout(this.doneTimer);
			},

			onModelChange: function(model, options) {
				// start rising past the threshold plays from the beginning.
				// Compared with the last value handled, not just "listed as
				// changed": Backbone fires this again with the same changes
				// after a nested set (CLAUDE.md). Only a value arriving
				// through a cable counts (syncWithSource marks those with
				// updateNoTrigger), as in Scene - not one a patch loads.
				if (this.domReady && !app.server && options && options.updateNoTrigger &&
					model.changedAttributes().start !== undefined) {
					var start = parseFloat(this.model.get('start')) || 0,
						startThreshold = parseFloat(this.model.get('threshold'));
					if (isNaN(startThreshold)) { startThreshold = 512; }
					var rose = this.lastStart < startThreshold && start >= startThreshold;
					this.lastStart = start;
					if (rose) { this.playFromStart(); }
				}

				if (this.domReady) {
					if (!app.server && (model.changedAttributes().play !== undefined || model.changedAttributes().volume !== undefined || model.changedAttributes().speed !== undefined)) {
						var play = parseInt(this.model.get('play'), 10);
						var volume = Math.min(parseFloat(this.model.get('volume')) / 100, 1.0);
						volume = Math.max(volume, 0.0);
						var speed = parseFloat(this.model.get('speed')) / 100;

						var audioEl = this.$(".audio")[0];

						if (model.changedAttributes().volume !== undefined) {
							audioEl.volume = volume;
						}

						if (model.changedAttributes().speed !== undefined) {
							audioEl.playbackRate = speed;
						}

						if (model.changedAttributes().play !== undefined) {
							if (!this.model.get('continuous')) {
								var threshold = parseInt(this.model.get('threshold'));
								if (play >= threshold && !this.playing) {
									this.playing = true;
									audioEl.play();
									this.model.set('playText', "Play");
								} else if (play < threshold && this.playing) {
									this.playing = false;
									audioEl.pause();
									if (!this.model.get('loop')) {
										audioEl.currentTime = 0;
										this.model.set('playText', "Stop");
									} else {
										this.model.set('playText', "Pause");
									}
								}
							}
						}
					}
				}

			},

			/**
			 * playFromStart - what start does: play the clip from the
			 * beginning, unless it's already playing.
			 *
			 * @return {void}
			 */
			playFromStart: function() {
				var audioEl = this.$(".audio")[0];
				if (!audioEl || !audioEl.paused) { return; }
				audioEl.loop = this.model.get('loop');
				audioEl.currentTime = 0;
				audioEl.play();
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

			// playText keeps this widget's existing wording: "Stop" when
			// it stops with loop off (it rewinds then), "Pause" with loop on.
			setPlayingState: function(playing) {
				this.playing = playing;
				this.model.set({
					isPlaying: playing,
					playText: playing ? "Play" : (this.model.get('loop') ? "Pause" : "Stop"),
				});
			},

			// The button next to the Play inlet's label - plays or stops
			// directly, so the widget can be tried without wiring anything
			// into Play. Stopping behaves like the inlet does: with loop
			// off it rewinds, with loop on it pauses in place.
			togglePlay: function(e) {
				if (app.server) { return; }
				var audioEl = this.$(".audio")[0];
				if (!audioEl) { return; }
				if (audioEl.paused || audioEl.ended) {
					audioEl.loop = this.model.get('loop');
					audioEl.play();
				}
				else {
					audioEl.pause();
					if (!this.model.get('loop')) {
						audioEl.currentTime = 0;
					}
				}
			},

			loopChange: function(e) {
				if (!app.server) {
					this.$(".audio")[0].loop = this.model.get('loop');
				}
			},

			continuousChange: function(e) {
				if (!app.server && this.model.get('continuous')) {
					this.playing = true;
					this.$(".audio")[0].play();
					this.model.set('playText', "Play");
				}
			},

			srcFileChange: function() {
				// Typing a bundled asset filename should take back over from a
				// previously browsed-to local file, not be silently ignored.
				this.model.set('localAudioPath', null);
				this.setSrc();
			},

			setSrc: function() {
				var localAudioPath = this.model.get('localAudioPath');

				if (localAudioPath) {
					// Served through /localAudio (see routes.js) rather than as a direct
					// file:// src - Chromium blocks file:// media loads from a page loaded
					// over http, which is how this app's renderer is loaded.
					this.model.set('src', '/localAudio?path=' + encodeURIComponent(localAudioPath));
				}
				else {
					this.model.set('src', 'assets/audio/' + this.model.get('srcFile'));
				}

        if (!app.server) {
          this.$(".audio")[0].load();
        }
			},

			browseAudio: function() {
				if (!window.ntkElectron) {
					// Not running inside the Electron app (e.g. a remote browser client) -
					// no local file picker available, fall back to the assets/audio field.
					return;
				}

				var self = this;
				window.ntkElectron.pickAudioFile().then(function(filePath) {
					if (filePath) {
						self.model.set('localAudioPath', filePath);
						self.setSrc();
					}
				});
			},

		});
	});
