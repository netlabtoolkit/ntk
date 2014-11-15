define([
	'backbone',
    'rivets',
	'views/item/WidgetMulti',
	'text!./template.js',

	// If you would like signal processing classes and functions include them here
	'utils/SignalChainFunctions',
	'utils/SignalChainClasses',
	// and any other imported libraries you like should go here
    'jqueryknob',
],
function(Backbone, rivets, WidgetView, Template, SignalChainFunctions, SignalChainClasses, jqueryknob){
    'use strict';

	return WidgetView.extend({
		// Define the inlets
		ins: [
			// title is decorative, to: <widget model field being set by inlet>
			{title: 'in', to: 'in'},
		],
		outs: [
			// title is decorative, from: <widget model field>, to: <widget model field being listened to>
			{title: 'out', from: 'outA', to: 'out1'},
            {title: 'out', from: 'outB', to: 'out2'},
            {title: 'out', from: 'outC', to: 'out3'},
            {title: 'out', from: 'outD', to: 'out4'},
		],
        // Any custom DOM events should go here (Backbone style)
        widgetEvents: {},
		// typeID us the unique ID for this widget. It must be a unique name as these are global.
		typeID: 'Splitter',
		className: 'splitter',
		template: _.template(Template),

		initialize: function(options) {
			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);

            // Call any custom DOM events here
			this.model.set({
                title: 'Splitter',
                outACenter: 200,
                outBCenter: 400,
                outCCenter: 600,
                outDCenter: 800,
                outWidth: 150,
                outMin: 0,
                outMax: 1023,
            });

            // If you want to register your own signal processing function, push them to signalChainFunctions
			//this.signalChainFunctions.push(this.limitRange);

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

        },

        onModelChange: function() {
            var input = this.model.get('in');
            var width = parseInt(this.model.get('outWidth'),10);
            var min = parseInt(this.model.get('outMin'),10);
            var max = parseInt(this.model.get('outMax'),10);
            
            var out = 
            this.model.set('outA',this.envelope(input,this.model.get('outACenter'),width,min,max));
            this.model.set('outB',this.envelope(input,this.model.get('outBCenter'),width,min,max));
            this.model.set('outC',this.envelope(input,this.model.get('outCCenter'),width,min,max));
            this.model.set('outD',this.envelope(input,this.model.get('outDCenter'),width,min,max));
        },

		// Any custom function can be attached to the widget like this "limitServoRange" function
		// and can be accessed via this.limitServoRange();
        limitRange: function(input) {
            var output = input;
            output = Math.max(output, 0);
            output = Math.min(output, 180);
            return Number(output);
        },
            
        envelope: function(input, center, width, min, max) {
            
            input = parseInt(input,10);
            center = parseInt(center,10);
            
            var splitValue = min;
            
            var start = center - (width/2);
            var end = center + (width/2);
            var sustainStart = start + (width/3);
            var sustainEnd = sustainStart + (width/3);
            
            var levelScale = max - min;
			var attackRange = levelScale/(sustainStart - start);
			var releaseRange = levelScale/(end - sustainEnd);
            
            if (input >= start && input <= end) {
                if(input >= sustainStart && input <= sustainEnd) {
                    splitValue = max;
                } else if(input < sustainStart) {
                    //newLevel = ((inputLevel - fadeInStart) * fadeInScale) + minLevel;
                    splitValue = ((input - start) * attackRange) + min;
                } else {
                    //newLevel = maxLevel - ((inputLevel - fadeOutStart) * fadeOutScale);
                    splitValue=  max - ((input - sustainEnd) * releaseRange);
                }
            } else {
                splitValue = min;
            }
            
            return parseInt(splitValue,10);
        },

	});
});
