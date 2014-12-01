define([
	'backbone',
	'rivets',
	'views/item/WidgetMulti',
	'text!./template.js',
],
function(Backbone, rivets, WidgetView, Template){
    'use strict';

	return WidgetView.extend({
		typeID: 'Audio',
		className: 'audio',
		template: _.template(Template),
		sources: [],
        widgetEvents: {
			'change #loop': 'loopChange',
		},

		initialize: function(options) {
			WidgetView.prototype.initialize.call(this, options);

			var elementSrc = undefined;

			if(!app.server) {
				elementSrc = prompt('Please enter the audio URL');
			}

			if(!elementSrc) {
				elementSrc = 'assets/audio/slowDrums.mp3';
			}

			this.model.set({
				src: elementSrc,
				ins: [
					//{name: 'in', to: 'in'},
					{title: 'Play', to: 'play'},
                    //{title: 'Toggle Play', to: 'toggle'},
					{title: 'Volume', to: 'volume'},
                    {title: 'Speed', to: 'speed'},
				],
				title: 'Audio',

				play: 0,
				toggle: 0,
                volume: 100.0,
				speed: 100.0,
                loop: false,
			});
                    
            this.playing = false;
                    
            this.domReady = false;
            
		},
        
        onRender: function() {
			WidgetView.prototype.onRender.call(this);
			var self = this;   
            this.$("#audio")[0].loop = this.model.get('loop');
            
            this.domReady = true;

		},
                    
        onModelChange: function() {
            if (this.domReady) {
                var play = parseInt(this.model.get('play'),10);
                var volume = Math.min(parseFloat(this.model.get('volume')) / 100,1.0);
                var speed = parseFloat(this.model.get('speed')) / 100;
                    
                var audioEl = this.$("#audio")[0];

                if (play >= 500 && !this.playing) {
                    audioEl.play();
                    this.playing = true;
                } else if (play < 500 && this.playing) {
                    audioEl.pause();
                    this.playing = false;
                }

                audioEl.volume = volume;

                audioEl.playbackRate = speed;
            }
            
        },
        
        loopChange: function(e) {
            this.$("#audio")[0].loop = this.model.get('loop');
        },

	});
});


