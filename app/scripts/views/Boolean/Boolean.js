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
			{title: 'in1', to: 'in1'},
			{title: 'in2', to: 'in2'},
            {title: 'in3', to: 'in3'},
			{title: 'in4', to: 'in4'},
		],
		outs: [
			// title: decorative, from: <widget model field>, to: <widget model field being listened to>
			{title: 'out1', from: 'output', to: 'out1'},
		],
		sources: [],
		typeID: 'Boolean',
		className: 'boolean',
		template: _.template(Template),

		initialize: function(options) {

			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);
            
            // Call any custom DOM events here
            this.model.set({
                title: 'Boolean',
                in1: '-',
				in2: '-',
                in3: '-',
				in4: '-',
				output: 0,
                boolean: 'all',
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
            if(model.changedAttributes().in1 !== undefined ||
               model.changedAttributes().in2 !== undefined ||
               model.changedAttributes().in3 !== undefined ||
               model.changedAttributes().in4 !== undefined) {
                
                var threshold = this.model.get('threshold');
                var ins = [parseFloat(this.model.get('in1')),
                           parseFloat(this.model.get('in2')),
                           parseFloat(this.model.get('in3')),
                           parseFloat(this.model.get('in4'))];
                
                var ifState = false;
                
                if (this.model.get('boolean') === 'all') {
                    // all inputs must be true
                    var ifState = true;
                    for (var i=0;i<ins.length;i++) {
                        if (!isNaN(ins[i]) && ins[i] < threshold) ifState = false;
                    }
                } else if (this.model.get('boolean') === 'any') { 
                    // any input can be true
                    for (var i=0;i<ins.length;i++) {
                        if (!isNaN(ins[i]) && ins[i] >= threshold) ifState = true;
                    }
                }
                

                if (ifState) {
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
