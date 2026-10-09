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
        categories: ['logic'],
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
                // "more" panel checkbox, 'latest' mode only: an input going
                // blank ('' or only spaces) doesn't count as the latest
                // change, so the output keeps the last real value. For
                // sources that send a value and then clear it - e.g. two
                // PoseRecog outlets in "output slot name" mode, where one
                // slot's name arrives and the other slot's '' follows right
                // behind it and would otherwise replace it.
                ignoreBlank: false,
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
                // False only when 'latest' had nothing but blanks to go on
                // with ignoreBlank ticked - the output is then left alone.
                var haveLatest = true;
                
                switch(this.model.get('mixType')) {
                    case 'latest':
                        var changed = model.changedAttributes();
                        var ignoreBlank = this.model.get('ignoreBlank') === true;
                        haveLatest = false;
                        for (var n=1;n<=4;n++) {
                            if (changed['in' + n] === undefined) continue;
                            var value = this.model.get('in' + n);
                            if (ignoreBlank && (value === null || String(value).trim() === '')) continue;
                            result = value;
                            haveLatest = true;
                        }
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
                if ((this.model.get('mixType') == 'latest' && haveLatest) ||
                    (this.model.get('mixType') != 'latest' && ins.length > 0)) {
                    this.model.set('output',result);
                } // else don't send any output if all inputs are non-numeric
                
                
            }
        },

	});
});
