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

			setVideoDimensions: function() {
				if (!app.server) {
					this.$('.detachedEl').css('width', this.model.get('displayWidth'));
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
				var offset = this.$('.detachedEl').offset();
				this.model.set('left', offset.left);
				this.model.set('top', offset.top);
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
