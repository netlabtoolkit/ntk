define([
	'backbone',
	'rivets',
	'views/item/WidgetMulti',
	'text!./template.js',
],
function(Backbone, rivets, WidgetView, Template){
    'use strict';

	return WidgetView.extend({
		typeID: 'Video',
		className: 'video',
		template: _.template(Template),
		sources: [],
		initialize: function(options) {
			WidgetView.prototype.initialize.call(this, options);

			var elementSrc = undefined;

			if(!app.server) {
				elementSrc = prompt('Please enter the video URL');
			}

			if(!elementSrc) {
				elementSrc = 'assets/video/ball.mp4';
			}

			this.model.set({
				src: elementSrc,
				ins: [
					{title: 'Play', to: 'play'},
					{title: 'Volume', to: 'volume'},
                    {title: 'Speed', to: 'speed'},
                    {title: 'Time', to: 'time'},
				],
				title: 'Video',

				play: 0,
				toggle: 0,
                volume: 100.0,
				speed: 100.0,
                time: 0,

			});

            this.lastTimeIn = 0;
            this.playing = false;

            this.domReady = false;

		},

        onRender: function() {
			WidgetView.prototype.onRender.call(this);
			var self = this;

            this.$('.detachedEl').css( 'cursor', 'move' );
            this.$( ".detachedEl" ).draggable({ cursor: "move" });

            this.domReady = true;

            //console.log($("#video")[0].duration);

		},

        onModelChange: function() {
            if (this.domReady) {
				if(!app.server) {
					var play = parseInt(this.model.get('play'),10);
					var volume = Math.min(parseFloat(this.model.get('volume')) / 100,1.0);
					var speed = parseFloat(this.model.get('speed')) / 100;
					var time = parseFloat(this.model.get('time'));
					var videoEl = this.$("#video")[0];

					if (play >= 500 && !this.playing) {
						videoEl.play();
						this.playing = true;
						//console.log('play');
					} else if (play < 500 && this.playing) {
						videoEl.pause();
						this.playing = false;
						//console.log('pause');
					}

					videoEl.volume = volume;

					videoEl.playbackRate = speed;

					if (time != this.lastTimeIn) {
						var timeLimited = Math.min(time, Math.floor(videoEl.duration));
						timeLimited = Math.max(timeLimited, 0);
						videoEl.currentTime = timeLimited;
						//console.log(videoEl.duration);
						//console.log(timeLimited);
					}
				}

                this.lastTimeIn = time;
            }

        },

	});
});


