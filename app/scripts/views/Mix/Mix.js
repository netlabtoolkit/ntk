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
		typeID: 'Mix',
		className: 'mix',
		template: _.template(Template),

		initialize: function(options) {

			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);
            
            // Call any custom DOM events here
            this.model.set({
                title: 'Mix',
                in1: '-',
				in2: '-',
                in3: '-',
				in4: '-',
				output: 0,
                mixType: 'latest',
            });

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
                
                var ins = [parseFloat(this.model.get('in1')),
                           parseFloat(this.model.get('in2')),
                           parseFloat(this.model.get('in3')),
                           parseFloat(this.model.get('in4'))];
                
                for (var i=(ins.length - 1);i>=0;i--) {
                    if (isNaN(ins[i])) ins.splice(i, 1);
                    
                }
                
                var result = 0;
                
                switch(this.model.get('mixType')) {
                    case 'latest':
                        if (model.changedAttributes().in1 !== undefined) result = this.model.get('in1');
                        if (model.changedAttributes().in2 !== undefined) result = this.model.get('in2');
                        if (model.changedAttributes().in3 !== undefined) result = this.model.get('in3');
                        if (model.changedAttributes().in4 !== undefined) result = this.model.get('in4');
                        break;
                        
                    case 'avg':
                        for (var i=0;i<ins.length;i++) {
                            result += ins[i];
                        }
                        result = result/ins.length;
                        break;
                        
                    case 'sum':
                        for (var i=0;i<ins.length;i++) {
                            result += ins[i];
                        }
                        break;
                        
                    case 'mult':
                        for (var i=0;i<ins.length;i++) {
                            if (i===0) result = ins[i];
                            else result *= ins[i];
                        }
                        break;
                        
                    case 'min':
                        for (var i=0;i<ins.length;i++) {
                            if (i===0) result = ins[i];
                            else if (ins[i] < result) {
                                result = ins[i];
                            }
                        }
                        break;
                        
                    case 'max':
                        for (var i=0;i<ins.length;i++) {
                            if (i===0) result = ins[i];
                            else if (ins[i] > result) {
                                result = ins[i];
                            }
                        }
                        break;
                        
                    default:
                        //
                }
                this.model.set('output',result);
                
            }
        },

	});
});
