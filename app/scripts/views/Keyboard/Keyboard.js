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

	// done stays at 1023 this long - long enough to see, like Button's.
	var DONE_MS = 200;

	return WidgetView.extend({
		// Define the inlets
		ins: [
			// title is decorative, to: <widget model field being set by inlet>
			//{title: 'in', to: 'in'},
		],
		outs: [
			// title is decorative, from: <widget model field>, to: <widget model field being listened to>
			{title: 'out', from: 'output', to: 'out'},
			// A header port (plans/control-flow.md): pulses 1023 for
			// DONE_MS on each key press - only the trigger key's, when
			// Trigger is checked - so a key starts a Scene, Sequence,
			// SpeechOut... Held keys auto-repeat; that doesn't pulse again.
			{title: 'next', from: 'done', to: 'done', header: true, noChain: true},
		],
        // Any custom DOM events should go here (Backbone style)
        widgetEvents: {

		},
		// typeID us the unique ID for this widget. It must be a unique name as these are global.
		typeID: 'Keyboard',
		className: 'keyboard',
        categories: ['UI'],
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
                done: 0,
            });
            this.doneTimer = null;
            
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
            // One namespace per widget, so onRemove takes off only this
            // widget's handlers (they used to outlive the widget).
            this.keyNamespace = '.keyboard' + this.cid;
            $( document ).off(this.keyNamespace);

            $( document ).on('keydown' + this.keyNamespace, function(e) {
                var repeat = e.originalEvent && e.originalEvent.repeat;
                self.model.set('in',e.which);
                if (self.model.get('keyDetect')) {
                    if (e.which === parseInt(self.model.get('keyDetectNum'))) {
                        self.model.set('output',self.model.get('outputCeiling'));
                        if (!repeat) { self.pulseDone(); }
                    } else {
                        self.model.set('output',self.model.get('outputFloor'));
                    }
                } else {
                    self.model.set('output',e.which);
                    if (!repeat) { self.pulseDone(); }
                }
            });

            $( document ).on('keyup' + this.keyNamespace, function(e) {
                if (self.model.get('keyDetect')) {
                    if (e.which === parseInt(self.model.get('keyDetectNum'))) {
                        self.model.set('output',self.model.get('outputFloor'));
                    }
                } 
            });
        },

        /**
         * setFromModel - a patch saved mid-pulse stores done at 1023,
         * with no timer left to bring it back down, so done always loads
         * as 0.
         *
         * @param {object} model
         * @return {WidgetView} this view
         */
        setFromModel: function(model) {
            var result = WidgetView.prototype.setFromModel.call(this, model);
            this.model.set('done', 0);
            return result;
        },

        /**
         * pulseDone - done goes to 1023 and back to 0 after DONE_MS.
         *
         * @return {void}
         */
        pulseDone: function() {
            var self = this;
            clearTimeout(this.doneTimer);
            this.model.set('done', 1023);
            this.doneTimer = setTimeout(function() { self.model.set('done', 0); }, DONE_MS);
        },

        onRemove: function() {
            clearTimeout(this.doneTimer);
            if (this.keyNamespace) { $( document ).off(this.keyNamespace); }
        },

	});
    

});
