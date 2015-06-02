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
			//{title: 'in', to: 'in'},
		],
		outs: [
			// title is decorative, from: <widget model field>, to: <widget model field being listened to>
			{title: 'out', from: 'output', to: 'out'},
		],
        // Any custom DOM events should go here (Backbone style)
        widgetEvents: {

		},
		// typeID us the unique ID for this widget. It must be a unique name as these are global.
		typeID: 'Keyboard',
		className: 'keyboard',
		template: _.template(Template),

		initialize: function(options) {
			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);

            // Call any custom DOM events here
            this.model.set({
                in: 0,
                output: 0,
                title: 'Keyboard',
                keyDetect: false,
                keyDetectNum: 32,
                outputFloor: 0,
                outputCeiling: 1023,
                
                
            });
            
            //this.signalChainFunctions.push(SignalChainFunctions.scale);
            
            this.model.set('in', this.model.get('outputFloor'));

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
            
            $( document ).keydown(function(e) {
                self.model.set('in',e.which);
                if (self.model.get('keyDetect')) {
                    if (e.which === parseInt(self.model.get('keyDetectNum'))) {
                        self.model.set('output',self.model.get('outputCeiling'));
                    } else {
                        self.model.set('output',self.model.get('outputFloor'));
                    }
                } else {
                    self.model.set('output',e.which);
                }
            });
            
            $( document ).keyup(function(e) {
                if (self.model.get('keyDetect')) {
                    if (e.which === parseInt(self.model.get('keyDetectNum'))) {
                        self.model.set('output',self.model.get('outputFloor'));
                    }
                } 
            });

        },

	});
    

});
