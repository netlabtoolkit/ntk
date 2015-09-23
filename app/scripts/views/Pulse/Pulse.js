define([
	'backbone',
    'rivets',
	'views/item/WidgetMulti',
	'text!./template.js',

	// If you would like signal processing classes and functions include them here
	'utils/SignalChainFunctions',
	'utils/SignalChainClasses',
],
function(Backbone, rivets, WidgetView, Template, SignalChainFunctions, SignalChainClasses){
    'use strict';

	return WidgetView.extend({
		// Map inputs to model
		ins: [
			// title: decorative, to: <widget model field>
			{title: 'in', to: 'in'},
            {title: 'pulseLength', to: 'timerLength'},
		],
		outs: [
			// title: decorative, from: <widget model field>, to: <widget model field being listened to>
			{title: 'out1', from: 'output', to: 'out1'},
		],
		sources: [],
		typeID: 'Pulse',
		className: 'pulse',
        categories: ['generator'],
		template: _.template(Template),

		initialize: function(options) {

			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);
            
            // Call any custom DOM events here
            this.model.set({
                title: 'Pulse',
                in: '--',
				out1: 0,
                pulseLow: 0,
                pulseHigh: 1023,
                threshold: 512,
                timerFiring: true,
                timerState: 'off',
                timerStart: Date.now(),
                timerLength: 1000,
                timerHighPercentage: 50,
                randOut: false,
                randLow: 0,
                randHigh: 1023,
                randTime: false,
                randTimeLow: 750,
                randTimeHigh: 2000,
            });
            
            this.stateHighlight = '#f8c885';
            this.domReady = false;
            this.lastTimeLength = this.model.get('timerLength');

            window.app.timingController.registerFrameCallback(this.timeKeeper, this);

		},
        /**
         * called when widget is rendered
         *
         * @return
         */
		onRender: function() {
			WidgetView.prototype.onRender.call(this);

            var self = this;
            
            if(!app.server) {
                this.$('.pulseHigh').css('background-color','#fff');
                this.$('.pulseLow').css('background-color',this.stateHighlight);
            }
            
            this.domReady = true;
            
		},
        
        onRemove: function() {
			window.app.timingController.removeFrameCallback(this.timeKeeper, this);
		},
        
        onModelChange: function(model) {
            if(model.changedAttributes().in !== undefined && !isNaN(model.changedAttributes().in)) {
                if (this.model.get('in') >= this.model.get('threshold')) {
                    if (!this.model.get('timerFiring')) {
                        this.model.set('timerFiring',true);
                        if (!app.server) {
                            this.$('.pulseHigh').css('background-color','#fff');
                            this.$('.pulseLow').css('background-color',this.stateHighlight);
                        }
                        this.initTimer();
                    }
                } else if (this.model.get('timerFiring')) {
                    this.model.set('timerFiring',false);
                    if (!this.model.get('randOut')) {
                        this.model.set('output',parseFloat(this.model.get('pulseLow'),10));
                        if (!app.server) {
                            this.$('.pulseHigh').css('background-color','#fff');
                            this.$('.pulseLow').css('background-color',this.stateHighlight);
                        }
                    }
                }
            }
            
            if(model.changedAttributes().timerLength !== undefined && !isNaN(model.changedAttributes().timerLength)) {
                if (this.lastTimeLength != this.model.get('timerLength')) {
                    if (!this.model.get('randTime')) {
                        if (this.model.get('timerLength') < 150) this.model.set('timerLength',150);
                    }
                }
                this.lastTimeLength = this.model.get('timerLength');
            }
        },
        
        timeKeeper: function() {
            if (this.domReady && this.model.get('timerFiring')) {
                var timerDiff = Date.now() - this.model.get('timerStart');

                if (!this.model.get('randOut')) {
                    // if non-random output, check for timerHighPercentage to turn off high output
                    var timerHighLength = Math.round(this.model.get('timerLength') * (this.model.get('timerHighPercentage')/100));
                    if (Date.now() - this.model.get('timerStart') > timerHighLength) {
                        this.model.set('output',parseFloat(this.model.get('pulseLow'),10));
                        if (!app.server) {
                            this.$('.pulseHigh').css('background-color','#fff');
                            this.$('.pulseLow').css('background-color',this.stateHighlight);
                        }
                    }
                }

                if (Date.now() - this.model.get('timerStart') > this.model.get('timerLength')) {
                    this.model.set('output',parseFloat(this.model.get('pulseHigh'),10));
                    if (!app.server) {
                        this.$('.pulseHigh').css('background-color',this.stateHighlight);
                        this.$('.pulseLow').css('background-color','#fff');
                    }
                    this.initTimer();
                }
            }
        },
        
        initTimer: function() {
            this.model.set('timerStart',Date.now());
            if (this.model.get('randTime')) this.setRandomTime();
            if (this.model.get('randOut')) this.setRandomOut();
        },
        
        setRandomTime: function() {
            var min = parseFloat(this.model.get('randTimeLow'),10);
            var max = parseFloat(this.model.get('randTimeHigh'),10)
            var randomTime = Math.floor(Math.random() * (max - min)) + min;
            this.model.set('timerLength',randomTime);
        },
            
        setRandomOut: function() {
            var min = parseFloat(this.model.get('randLow'),10);
            var max = parseFloat(this.model.get('randHigh'),10)
            var output = Math.floor(Math.random() * (max - min)) + min;
            this.model.set('pulseHigh',output);
        },

	});
});
