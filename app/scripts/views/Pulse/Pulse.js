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
                timerLength: 1000,
                timerHighPercentage: 50,
                randOut: false,
                randLow: 0,
                randHigh: 1023,
                randTime: false,
                randTimeLow: 750,
                randTimeHigh: 2000,
                mainTimer: 0,
                highTimer: 0,
            });
            
            this.stateHighlight = '#f8c885';
            //this.mainTimer = 0;
            //this.highTimer = 0;
            this.domReady = false;
            this.lastTimeLength = this.model.get('timerLength');


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
                self.$('.pulseHigh').css('background-color','#fff');
                self.$('.pulseLow').css('background-color',self.stateHighlight);
            }
            
            this.domReady = true;
            
            this.setTimer();
            
            
		},
        
        onRemove: function() {
			window.clearTimeout(this.model.get('mainTimer'));
            window.clearTimeout(this.model.get('highTimer'));
		},
        
        onModelChange: function(model) {
            if(model.changedAttributes().in !== undefined && !isNaN(model.changedAttributes().in)) {
                if (this.model.get('in') >= this.model.get('threshold')) {
                    this.model.set('timerFiring',true);
                } else {
                    this.model.set('timerFiring',false);
                }
            }
            
            if(model.changedAttributes().timerLength !== undefined && !isNaN(model.changedAttributes().timerLength)) {
                if (this.lastTimeLength != this.model.get('timerLength')) {
                    if (!this.model.get('randTime')) {
                        if (this.model.get('timerLength') < 150) this.model.set('timerLength',150);
                        this.setTimer();
                    }
                }
                this.lastTimeLength = this.model.get('timerLength');
            }  
                
            
            if(model.changedAttributes().randTime !== undefined) {
                this.setTimer();
            }
        },
        
        setTimer: function() {
            if (this.domReady) {
                self = this;
                //window.cleartnterval(this.model.get('mainTimer'));
                window.clearTimeout(this.model.get('mainTimer'));
                window.clearTimeout(this.model.get('highTimer'));
                if (!this.model.get('randTime')) {
                    //var mainTimer = setInterval(function () {
                    var mainTimer = setTimeout(function () {
                        self.timerFire(self);
                    }, this.model.get('timerLength'));
                    this.model.set('mainTimer',mainTimer);
                } else {
                    this.setRandomTime(self);
                }
            }
            
        },
        
        timerFire: function(self) {
            console.log('timerfire: ' + this.model.get('timerLength'));
            if (self.model.get('timerFiring')) {
                var output = parseFloat(self.model.get('pulseHigh'),10);
                if (self.model.get('randOut')) {
                    var min = parseFloat(self.model.get('randLow'),10);
                    var max = parseFloat(self.model.get('randHigh'),10)
                    output = Math.floor(Math.random() * (max - min)) + min;
                    self.model.set('pulseHigh',output);
                }
                self.model.set('output',output);
                if(!app.server) {
                    self.$('.pulseHigh').css('background-color',self.stateHighlight);
                    self.$('.pulseLow').css('background-color','#fff');
                }
                if (!self.model.get('randOut')) { // only go back to low value if sending a fixed output
                    // use the percentage in timerHighPercentage to calculate how long to output the high value
                    var timerHighLength = Math.round(this.model.get('timerLength') * (self.model.get('timerHighPercentage')/100));
                    window.clearTimeout(this.model.get('highTimer'));
                    var highTimer = setTimeout(function () {
                        self.model.set('output',parseFloat(self.model.get('pulseLow'),10));
                        if(!app.server) {
                            self.$('.pulseHigh').css('background-color','#fff');
                            self.$('.pulseLow').css('background-color',self.stateHighlight);
                        }
                    }, timerHighLength);
                    this.model.set('highTimer',highTimer);
                }
            }
            if (this.model.get('randTime')) {
                self.setRandomTime(self);
            } else {
                console.log('restart: ' + self.model.get('timerLength'));
                var mainTimer = setTimeout(function () {
                    self.timerFire(self);
                }, self.model.get('timerLength'));
                self.model.set('mainTimer',mainTimer);
            }
        },
        
        setRandomTime: function(self) {
            window.clearInterval(this.model.get('mainTimer'));
            //window.clearTimeout(self.highTimer);
            var min = parseFloat(self.model.get('randTimeLow'),10);
            var max = parseFloat(self.model.get('randTimeHigh'),10)
            var randomTime = Math.floor(Math.random() * (max - min)) + min;
            self.model.set('timerLength',randomTime);
            var mainTimer = setTimeout(function () {
                self.timerFire(self);
            }, randomTime);
            this.model.set('mainTimer',mainTimer);
        }

	});
});
