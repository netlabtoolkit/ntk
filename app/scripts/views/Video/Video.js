define([
		'backbone',
		'rivets',
		'views/item/WidgetMulti',
		'text!./template.js',
	],
	function(Backbone, rivets, WidgetView, Template) {
		'use strict';

		return WidgetView.extend({
			typeID: 'Video',
			categories: ['media'],
			className: 'video',
			template: _.template(Template),
			sources: [],
			widgetEvents: {
				'change .loop': 'loopChange',
				'change .continuous': 'continuousChange',
				'change .displayWidth': 'setVideoDimensions',
				'mouseup .detachedEl': 'imgMoved',
        'change .srcFile': 'srcFileChange',
        'click .browseVideo': 'browseVideo',
        'click .playToggle': 'togglePlay',
			},

			initialize: function(options) {
				WidgetView.prototype.initialize.call(this, options);

				this.model.set({
					src: 'assets/video/nyc_people.mp4',
          srcFile: 'nyc_people.mp4',
          localVideoPath: null,
					ins: [{
							title: 'Play',
							to: 'play'
						},
						/*					{title: 'Volume', to: 'volume'},*/
						{
							title: 'Speed',
							to: 'speed'
						}, {
							title: 'Time',
							to: 'time'
						}, {
							title: 'opacity',
							to: 'opacity'
						},
					],
					title: 'Video',

					play: 0,
					playText: "Pause",
					// Whether the video element is actually playing right
					// now - drives the play/pause button's look. Kept in
					// step by the element's own events (see onRender), so
					// it's right however playback started or stopped.
					isPlaying: false,
					toggle: 0,
					volume: 100.0,
					speed: 100.0,
					time: 0,
					loop: false,
					continuous: false,
					threshold: 512,

					activeControlParameter: 'left',
					controlParameters: [{
						name: 'X',
						parameter: 'left',
					}, {
						name: 'Y',
						parameter: 'top',
					}, {
						name: 'opacity',
						parameter: 'opacity',
					}, ],
					displayWidth: 500,
					left: 100,
					top: 200,
					opacity: 100,


				});

				this.playing = false;

				this.domReady = false;

			},

			onRender: function() {
				WidgetView.prototype.onRender.call(this);
				var self = this;
				if (!app.server) {
					this.$('.detachedEl').css('cursor', 'move');
					this.$('.detachedEl').css('position', 'fixed');
					this.$('.detachedEl').draggable({
						cursor: "move"
					});

					// The play/pause button (and this.playing, which the
					// Play inlet's threshold logic reads) follow what the
					// element is really doing. Without the 'ended' case a
					// clip that ran out with loop off still counted as
					// playing: nothing showed that it had stopped, and
					// the Play inlet couldn't start it again until its
					// input had dropped below the threshold and come back.
					var videoEl = this.$(".video")[0];
					if (videoEl) {
						videoEl.addEventListener('play', function() { self.setPlayingState(true); });
						videoEl.addEventListener('pause', function() { self.setPlayingState(false); });
						videoEl.addEventListener('ended', function() { self.setPlayingState(false); });
					}

					// Every render builds a new <video width="500"> - apply
					// the saved width to it (wiring anything into the
					// widget re-renders it, which used to snap it back
					// to 500).
					this.applyDisplayWidth();

					//console.log("vid: " + this.$(".video")[0].currentSrc);
					this.domReady = true;
					this.init = false;

					$(document).ready(function() {
						//console.log('ready')
            self.setSrc();
					});

				}

				//console.log($(".video")[0].duration);

			},

			onModelChange: function(model) {
				// Off the model, not only the width field's own DOM event
				// (setVideoDimensions) - so a width that arrives any other
				// way is applied too, in particular a loaded patch's saved
				// width, which is set on the model after the widget has
				// already rendered at the default.
				if (this.domReady && model.changedAttributes().displayWidth !== undefined) {
					this.applyDisplayWidth();
				}

				if (this.domReady) {

					if (!app.server && (model.changedAttributes().play != undefined || model.changedAttributes().speed != undefined || model.changedAttributes().time != undefined)) {
						var play = parseInt(this.model.get('play'), 10);
						var volume = Math.min(parseFloat(this.model.get('volume')) / 100, 1.0);
						var speed = parseFloat(this.model.get('speed')) / 100;
						var time = parseFloat(this.model.get('time'));
						var threshold = parseInt(this.model.get('threshold'));
						var videoEl = this.$(".video")[0];

						if (model.changedAttributes().speed != undefined) {
							videoEl.playbackRate = speed;
						}

						if (model.changedAttributes().time != undefined) {
							// 'time' arrives in NTK's standard 0-1023 control range (see
							// Knob.js), not in seconds - scale it onto the video's actual
							// duration so the full range of an incoming knob/slider maps
							// across the whole video, instead of almost every value
							// clamping to the very end of a short clip.
							var duration = videoEl.duration || 0;
							var timeLimited = (time / 1023) * duration;
							timeLimited = Math.min(timeLimited, duration);
							timeLimited = Math.max(timeLimited, 0);
							videoEl.currentTime = timeLimited;
						}
						if (model.changedAttributes().play != undefined) {

							if (!this.model.get('continuous')) {
								if (play >= threshold && !this.playing) {
									videoEl.play();
									this.playing = true;
									this.model.set('playText', "Play");
								} else if (play < threshold && this.playing) {
									videoEl.pause();
									this.playing = false;
									this.model.set('playText', "Pause");
								}
							}
						}
					}
				}

			},

			loopChange: function(e) {
				if (!app.server) {
          //this.$(".video")[0].load();
					this.$(".video")[0].loop = this.model.get('loop');
				}
			},

			setPlayingState: function(playing) {
				this.playing = playing;
				this.model.set({isPlaying: playing, playText: playing ? "Play" : "Pause"});
			},

			// The button next to the Play inlet's label - plays or pauses
			// directly, so the widget can be tried without wiring anything
			// into Play. A clip that has ended starts again from the top.
			togglePlay: function(e) {
				if (app.server) { return; }
				var videoEl = this.$(".video")[0];
				if (!videoEl) { return; }
				if (videoEl.paused || videoEl.ended) {
					videoEl.loop = this.model.get('loop');
					videoEl.play();
				}
				else {
					videoEl.pause();
				}
			},

			// Width in pixels; height follows the video's own proportions.
			applyDisplayWidth: function() {
				if (app.server) { return; }
				var width = parseInt(this.model.get('displayWidth'), 10);
				if (!(width > 0)) { return; }
				this.$('.detachedEl').css({width: width + 'px', height: 'auto'});
			},

			setVideoDimensions: function() {
				if (!app.server) {
					this.applyDisplayWidth();
          this.$(".video")[0].loop = this.model.get('loop');

          if (this.model.get('continuous')) {
            this.playing = true;
            this.$(".video")[0].play();
            this.model.set('playText', "Play");
          }
				}
			},

			continuousChange: function(e) {
				if (!app.server) {
					if (this.model.get('continuous')) {
						this.$(".video")[0].loop = this.model.get('loop');
						this.$(".video")[0].play();
						this.playing = true;
						this.model.set('playText', "Play");
					}
				}
			},

			imgMoved: function(e) {
				// position:fixed box - read raw css left/top (round-trips with
				// the rv-positionx/y binders); .offset() adds page scroll and
				// drifts the box on every move. Clamp so it stays reachable.
				var $box = this.$('.detachedEl');
				var left = parseInt($box.css('left'), 10) || 0;
				var top = parseInt($box.css('top'), 10) || 0;
				left = Math.max(0, Math.min(left, (window.innerWidth || 1200) - 60));
				top = Math.max(0, Math.min(top, (window.innerHeight || 800) - 40));
				$box.css({ left: left + 'px', top: top + 'px' });
				this.model.set('left', left);
				this.model.set('top', top);
			},

			srcFileChange: function() {
				// Typing a bundled asset filename should take back over from a
				// previously browsed-to local file, not be silently ignored.
				this.model.set('localVideoPath', null);
				this.setSrc();
			},

			setSrc: function() {
				var localVideoPath = this.model.get('localVideoPath');

				if (localVideoPath) {
					// Served through /localVideo (see routes.js) rather than as a direct
					// file:// src - Chromium blocks file:// media loads from a page loaded
					// over http, which is how this app's renderer is loaded.
					this.model.set('src', '/localVideo?path=' + encodeURIComponent(localVideoPath));
				}
				else {
					this.model.set('src', 'assets/video/' + this.model.get('srcFile'));
				}

        this.$(".video")[0].load();
        this.setVideoDimensions();
        this.loopChange();
			},

			browseVideo: function() {
				if (!window.ntkElectron) {
					// Not running inside the Electron app (e.g. a remote browser client) -
					// no local file picker available, fall back to the assets/video field.
					return;
				}

				var self = this;
				window.ntkElectron.pickVideoFile().then(function(filePath) {
					if (filePath) {
						self.model.set('localVideoPath', filePath);
						self.setSrc();
					}
				});
			},

		});
	});
