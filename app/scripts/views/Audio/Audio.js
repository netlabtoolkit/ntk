define([
		'backbone',
		'rivets',
		'views/item/WidgetMulti',
		'text!./template.js',
	],
	function(Backbone, rivets, WidgetView, Template) {
		'use strict';

		return WidgetView.extend({
			typeID: 'Audio',
			categories: ['media'],
			className: 'audio',
			template: _.template(Template),
			sources: [],
			widgetEvents: {
				'change .loop': 'loopChange',
				'change .continuous': 'continuousChange',
				'change .srcFile': 'setSrc',
			},

			initialize: function(options) {
				WidgetView.prototype.initialize.call(this, options);

				this.model.set({
					src: 'assets/audio/song_part5.wav',
					srcFile: 'song_part5.wav',
					ins: [{
						title: 'Play',
						to: 'play'
					}, {
						title: 'Volume',
						to: 'volume'
					}, {
						title: 'Speed',
						to: 'speed'
					}, ],
					title: 'Audio',

					play: 0,
					playText: "Pause",
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
					this.$(".audio")[0].loop = this.model.get('loop');
					if (this.model.get('continuous')) {
						this.playing = true;
						this.$(".audio")[0].play();
						this.model.set('playText', "Play");
					}
					this.domReady = true;
				}
			},

			onModelChange: function(model) {
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

			setSrc: function() {
				this.model.set('src', 'assets/audio/' + this.model.get('srcFile'));
        if (!app.server) {
          this.$(".audio")[0].load();
        }
			},

		});
	});
