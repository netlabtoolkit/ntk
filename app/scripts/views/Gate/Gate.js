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
			{title: 'inGate', to: 'inGate'},
            {title: 'inFalse', to: 'inFalse'},
            {title: 'inTrue', to: 'inTrue'},
		],
		outs: [
			// title: decorative, from: <widget model field>, to: <widget model field being listened to>
			{title: 'out1', from: 'output', to: 'out1'},
		],
		sources: [],
		typeID: 'Gate',
		categories: ['logic'],
		className: 'gate',
		template: _.template(Template),

		initialize: function(options) {

			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);
            
            // Call any custom DOM events here
            this.model.set({
                title: 'Gate',
                inGate: 0,
				inTrue: 'T',
                inFalse: 'F',
				out1: 0,
                ifFalse: 0,
                ifTrue: 1023,
                threshold: 512,
            });
            
            this.stateHighlight = '#f8c885';


		},
        /**
         * called when widget is rendered
         *
         * @return
         */
		onRender: function() {
			WidgetView.prototype.onRender.call(this);

            var self = this;

		},
        
        onModelChange: function(model) {
            if(model.changedAttributes().inGate !== undefined ||
               model.changedAttributes().inTrue !== undefined ||
               model.changedAttributes().inFalse !== undefined) {
                
                var inFalse = parseFloat(this.model.get('inFalse'));
                var inTrue = parseFloat(this.model.get('inTrue'));
                
                if (!isNaN(inTrue)) {
                    this.model.set('ifTrue',inTrue);
                }

                if (!isNaN(inFalse)) {
                    this.model.set('ifFalse',inFalse);
                }
                
                var threshold = this.model.get('threshold');

                if (this.model.get('inGate') >= threshold) {
                    this.$('.ifTrue').css('background-color',this.stateHighlight);
                    this.$('.ifFalse').css('background-color','#fff');
                    this.model.set('output',this.model.get('ifTrue'));
                } else {
                    this.$('.ifTrue').css('background-color','#fff');
                    this.$('.ifFalse').css('background-color',this.stateHighlight);
                    this.model.set('output',this.model.get('ifFalse'));
                }
            }
        },

	});
});
