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
        widgetEvents: {
			'change #loop': 'loopChange',
            'change #continuous': 'continuousChange',
            'mouseup .detachedEl': 'imgMoved',
		},

		initialize: function(options) {
			WidgetView.prototype.initialize.call(this, options);

			this.model.set({
				srcmp4: 'assets/video/ball.mp4',
                srcogg: 'assets/video/ball.ogv',
				ins: [
					{title: 'Play', to: 'play'},
/*					{title: 'Volume', to: 'volume'},*/
                    {title: 'Speed', to: 'speed'},
                    {title: 'Time', to: 'time'},
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
                
                activeControlParameter: 'left',
				controlParameters: [
					{
						name: 'X',
						parameter: 'left',
					},
					{
						name: 'Y',
						parameter: 'top',
					},
					{
						name: 'opacity',
						parameter: 'opacity',
					},
				],
				left: 100,
                top: 200,
				opacity: 100,


			});

            this.lastTimeIn = 0;
            this.playing = false;

            this.domReady = false;

		},

        onRender: function() {
			WidgetView.prototype.onRender.call(this);
			var self = this;
            if(!app.server) {
                this.$( '.detachedEl' ).css( 'cursor', 'move' );
                this.$( '.detachedEl' ).css( 'position', 'fixed' );
                this.$( '.detachedEl' ).draggable({ cursor: "move" });
                
                if (this.model.get('continuous')) {
                    this.playing = true;
                    this.$("#video")[0].play();
                    this.model.set('playText',"Play");
                }
                
                //console.log("vid: " + this.$("#video")[0].currentSrc);
                this.domReady = true;
                
            }

            //console.log($("#video")[0].duration);

		},

        onModelChange: function(model) {
            if (this.domReady) {
				if(!app.server  && (model.changedAttributes().play || model.changedAttributes().speed || model.changedAttributes().time)) {
					var play = parseInt(this.model.get('play'),10);
					var volume = Math.min(parseFloat(this.model.get('volume')) / 100,1.0);
					var speed = parseFloat(this.model.get('speed')) / 100;
					var time = parseFloat(this.model.get('time'));
					var videoEl = this.$("#video")[0];
                    
                    if (model.changedAttributes().speed) {
					   videoEl.playbackRate = speed;
                    }
                    
                    if (time != this.lastTimeIn && model.changedAttributes().time) {
						var timeLimited = Math.min(time, Math.floor(videoEl.duration));
						timeLimited = Math.max(timeLimited, 0);
						videoEl.currentTime = timeLimited;
					}
                
                    if (model.changedAttributes().play) {
                        if (!this.model.get('continuous')) {
                            if (play >= 500 && !this.playing) {
                                videoEl.play();
                                this.playing = true;
                                this.model.set('playText',"Play");
                            } else if (play < 500 && this.playing) {
                                videoEl.pause();
                                this.playing = false;
                                this.model.set('playText',"Pause");
                            }
                        }
                    }
				}

                this.lastTimeIn = time;
            }

        },
                             
        loopChange: function(e) {
            if(!app.server) {
                this.$("#video")[0].loop = this.model.get('loop');
            }
        },
            
        continuousChange: function(e) {
            if(!app.server) {
                if (this.model.get('continuous')) {
                    this.$("#video")[0].loop = this.model.get('loop');
                    this.$("#video")[0].play();
                    this.playing = true;
                    this.model.set('playText',"Play");
                }
            }
        },
        
        imgMoved: function(e) {
            var offset = this.$('.detachedEl').offset();
            this.model.set('left',offset.left);
            this.model.set('top',offset.top);
        },

	});
});


