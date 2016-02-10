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
		typeID: 'Count',
		className: 'count',
        categories: ['logic'],
		template: _.template(Template),

		initialize: function(options) {

			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);
            
            // Call any custom DOM events here
            this.model.set({
                title: 'Count',
                in1: '-',
				in2: '-',
                in3: '-',
				in4: '-',
				output: 0,
                outputFloor: 0,
                outputCeiling: 10,
                threshold: 512,
                increment: 1,
                lastIns: [-1,-1,-1,-1],
                
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
            if((model.changedAttributes().in1 !== undefined && model.changedAttributes().in1 != this.model.get('lastIns')[0]) ||
               (model.changedAttributes().in2 !== undefined && model.changedAttributes().in1 != this.model.get('lastIns')[1]) ||
               (model.changedAttributes().in3 !== undefined && model.changedAttributes().in1 != this.model.get('lastIns')[2]) ||
               (model.changedAttributes().in4 !== undefined && model.changedAttributes().in1 != this.model.get('lastIns')[3])) {
                
                var ins = [parseFloat(this.model.get('in1')),
                           parseFloat(this.model.get('in2')),
                           parseFloat(this.model.get('in3')),
                           parseFloat(this.model.get('in4'))];
                
                /*for (var i=(ins.length - 1);i>=0;i--) {
                    if (isNaN(ins[i])) ins.splice(i, 1);
                    
                }*/
                
                var result = parseFloat(this.model.get('output'));
                var increaseBy = 0;
                var threshold = this.model.get('threshold');
                
                //console.log(this.model.get('lastIns')[0]);
                
                //for (var i=0;i<ins.length;i++) {
                if (model.changedAttributes().in1 !== undefined) {
                    if (this.model.get('lastIns')[0] < threshold && ins[0] >= threshold) increaseBy++;
                    this.model.get('lastIns')[0] = ins[0];
                }
                if (model.changedAttributes().in2 !== undefined) {
                    if (this.model.get('lastIns')[1] < threshold && ins[1] >= threshold) increaseBy++;
                    this.model.get('lastIns')[1] = ins[1];
                }
                if (model.changedAttributes().in3 !== undefined) {
                    if (this.model.get('lastIns')[2] < threshold && ins[2] >= threshold) increaseBy++;
                    this.model.get('lastIns')[2] = ins[2];
                }
                if (model.changedAttributes().in4 !== undefined) {
                    if (this.model.get('lastIns')[3] < threshold && ins[3] >= threshold) increaseBy++;
                    this.model.get('lastIns')[3] = ins[3];
                }
                        
                //console.log(increaseBy);
                increaseBy *= this.model.get('increment');
                result += increaseBy;
                if (result > this.model.get('outputCeiling')) result = this.model.get('outputFloor');
                else if (result < this.model.get('outputFloor')) result = this.model.get('outputCeiling');
                
                this.model.set('output',result);
                
            }
        },

	});
});
