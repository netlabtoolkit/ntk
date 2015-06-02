define([
	'backbone',
    'rivets',
	'views/item/WidgetMulti',
	'text!./template.js',

	// If you would like signal processing classes and functions include them here
	'utils/SignalChainFunctions',
	'utils/SignalChainClasses',
	// and any other imported libraries you like should go here
],
function(Backbone, rivets, WidgetView, Template, SignalChainFunctions, SignalChainClasses){
    'use strict';

	return WidgetView.extend({
		// Define the inlets
		ins: [
			// title is decorative, to: <widget model field being set by inlet>
			{title: 'in', to: 'in'},
		],
		outs: [
			// title is decorative, from: <widget model field>, to: <widget model field being listened to>
			{title: 'out', from: 'in', to: 'out'},
		],
        // Any custom DOM events should go here (Backbone style)
        widgetEvents: {},
		// typeID us the unique ID for this widget. It must be a unique name as these are global.
		typeID: 'IfThen',
		className: 'ifThen',
		template: _.template(Template),

		initialize: function(options) {
			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);

            // Call any custom DOM events here
            this.model.set({
                title: 'IfThen',
                
                operator: '>',
                compareValue: 512,
                compareRange: 150,
                ifFalse: 0,
                ifTrue: 1023,
                waitTimeTrue: 0,
                waitTimeFalse: 0,
                
                ifState: 'falseOn',
                
            });
            
            this.stateHighlight = '#f8c885';
            this.waitLastTrueState = false;
            this.waitLastFalseState = false;
            this.waitTimeTrueStart = 0;
            this.waitTimeFalseStart = 0;
            this.waitTimer = 0;
            this.blinkTimer = 0;

            // If you want to register your own signal processing function, push them to signalChainFunctions
			this.signalChainFunctions.push(this.ifTest);

			// Likewise, if you need to register an instance-based processor
			//this.smoother = new SignalChainClasses.Smoother({tolerance: 50});
			//this.signalChainFunctions.push(this.smoother.getChainFunction());

			// If you would like to register any function to be called at frame rate (60fps)
			//window.app.timingController.registerFrameCallback(this.processSignalChain, this);
		},

        /**
         * Called when widget is rendered
		 * Most of your custom binding and functionality will happen here
         *
         * @return {void}
         */
        onRender: function() {
			// always call the superclass
            WidgetView.prototype.onRender.call(this);

            var self = this;
            
            // force signal chain to check in value so output and display are correct
            var intiaValue = this.model.get('in');
            this.model.set('in',-1);
            this.model.set('in',intiaValue);

        },

		// Any custom function can be attached to the widget like this "limitServoRange" function
		// and can be accessed via this.limitServoRange();
        ifTest: function(input) {
            var self = this;
            //var output = this.model.get('ifFalse');
            var output = 300;
            var compareValue = parseFloat(this.model.get('compareValue'),10);
            var compareRange = parseFloat(this.model.get('compareRange'),10) / 2;
            var waitTimeTrue = parseInt(this.model.get('waitTimeTrue'),10);
            var waitTimeFalse = parseInt(this.model.get('waitTimeFalse'),10);
            
            var comparison = false;
            
            switch(this.model.get('operator')) {
                case '~=':
                    if (input >= (compareValue - compareRange) && input <= (compareValue + compareRange)) {
                        comparison = true;
                    } 
                    break;
                case '>':
                    if (input > compareValue) {
                        comparison = true;
                    }
                    break;
                case '<':
                    if (input < compareValue) {
                        comparison = true;
                    }
                    break;

                default:
                    //
            }
            
            
            if (comparison == true) {
                this.waitLastFalseState = false;
                if (waitTimeTrue == 0 || this.model.get('ifState') == 'falseWaiting') {
                    output = this.model.get('ifTrue');
                    this.model.set('ifState','trueOn');
                    this.waitLastTrueState = true;
                    clearTimeout(this.waitTimer);
                } else { 
                    var d = new Date();
                    if (this.waitLastTrueState == false) { // start a new wait
                        this.waitTimeTrueStart = d.getTime();
                        this.waitLastTrueState = true;
                        this.model.set('ifState','trueWaitStart');
                        output = this.model.get('ifFalse');
                        clearTimeout(this.waitTimer);
                        setTimeout(function(){
                            if (self.waitLastTrueState == true) {
                                self.model.set('ifState','trueOn'); 
                                self.model.set('out',self.model.get('ifTrue'));
                                //console.log("end true timer");
                            }
                        }, waitTimeTrue);
                        //console.log("start true timer");
                    } else { // check to see if we've been true long enough
                        if ((d.getTime() - this.waitTimeTrueStart) >= waitTimeTrue) {
                            output = this.model.get('ifTrue');
                            this.model.set('ifState','trueOn'); 
                        } else {
                            output = this.model.get('ifFalse');
                            this.model.set('ifState','trueWaiting');
                        }
                    }
                    this.waitLastTrueState = true;
                }
            } else {
                this.waitLastTrueState = false;
                if (waitTimeFalse == 0 || this.model.get('ifState') == 'trueWaiting') {
                    output = this.model.get('ifFalse');
                    this.model.set('ifState','falseOn');
                    this.waitLastFalseState = true;
                    clearTimeout(this.waitTimer);
                } else { 
                    var d = new Date();
                    if (this.waitLastFalseState == false) { // start a new wait
                        this.waitTimeFalseStart = d.getTime();
                        this.waitLastFalseState = true;
                        this.model.set('ifState','falseWaitStart');
                        output = this.model.get('ifTrue');
                        clearTimeout(this.waitTimer);
                        this.waitTimer = setTimeout(function(){
                            if (self.waitLastFalseState == true) {
                                self.model.set('ifState','falseOn'); 
                                self.model.set('out',self.model.get('ifFalse'));
                                //console.log("end false timer");
                            }
                        }, waitTimeFalse);
                        //console.log("start false timer");
                    } else { // check to see if we've been true long enough
                        if ((d.getTime() - this.waitTimeFalseStart) >= waitTimeFalse) {
                            output = this.model.get('ifFalse');
                            this.model.set('ifState','falseOn'); 
                        } else {
                            output = this.model.get('ifTrue');
                            this.model.set('ifState','falseWaiting');
                        }
                    }
                    this.waitLastFalseState = true;
                }
            }
            
            return Number(output);
        },
        
        onModelChange: function(model) {
            if(model.changedAttributes().ifState !== undefined) {
                if (this.model.get('ifState') == 'trueOn') {
                    clearInterval(this.blinkTimer);
                    this.$('#ifTrue').css('background-color',this.stateHighlight);
                    this.$('#ifFalse').css('background-color','#fff');
                } else if (this.model.get('ifState') == 'trueWaitStart') {
                    clearInterval(this.blinkTimer);
                    this.blinkTimer = this.blinkState(this.$('#ifTrue'));
                } else if (this.model.get('ifState') == 'falseOn') {
                    clearInterval(this.blinkTimer);
                    this.$('#ifTrue').css('background-color','#fff');
                    this.$('#ifFalse').css('background-color',this.stateHighlight);
                } else if (this.model.get('ifState') == 'falseWaitStart') {
                    clearInterval(this.blinkTimer);
                    this.blinkTimer = this.blinkState(this.$('#ifFalse'));
                } 
            }
        },
        
        blinkState: function(el) {
            var blinkState = false;
            var self = this;
            var blinkTimer = setInterval(function(){
                if (!blinkState) {
                    el.css('background-color',self.stateHighlight);
                    blinkState = true;
                } else {
                    el.css('background-color','#fff');
                    blinkState = false;
                } 
            }, 150);
            
            return blinkTimer;
        }

	});
});
