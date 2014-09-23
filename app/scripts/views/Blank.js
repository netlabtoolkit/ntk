define([
	'backbone',
    'rivets',
	'views/item/WidgetMulti',
	'text!tmpl/Blank_tmpl.js',

	'utils/SignalChainFunctions',
    'jqueryknob',
],
function(Backbone, rivets, WidgetView, Template, SignalChainFunctions, jqueryknob){
    'use strict';

	return WidgetView.extend({
		ins: [
			{title: 'in', to: 'in'},
		],
		outs: [
			// title is decorative, from: <widget model field>, to: <widget model field being listened to>
			{title: 'out', from: 'in', to: 'out'}, 
		],
        // Any custom DOM events should go here
        widgetEvents: {},
		typeID: 'Blank',
		className: 'blank',
		template: _.template(Template),

		initialize: function(options) {
            //console.log(this.ins);
			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);

            // Call any custom DOM events here
			this.model.set('title', 'Blank');

            // If you want to register your own signal processing function, push them to signalChainFunctions
			this.signalChainFunctions.push(this.limitServoRange);
		},

        /**
         * called when widget is rendered
         *
         * @return {void}
         */
        onRender: function() {
            WidgetView.prototype.onRender.call(this);
            
            var self = this;

			this.$('.dial').knob({
				'fgColor':'#000000',
				'bgColor':'#ffffff',
				'inputColor' : '#000000',
				'angleOffset':-90,
				'angleArc':180,
				'width':80,
				'height':62,
				'font':"'Helvetica Neue', sans-serif",
				'displayInput':false,
				'min': 0,
				'max': 180,
				'change' : function (v) { self.model.set('in', parseInt(v)); }
			});


			rivets.binders.knob = function(el, value) {
				el.value = value;
				$(el).val(value);
				$(el).trigger('change');
			};
        },
        
                
        limitServoRange: function(input) {
            var output = input;
            output = Math.max(output, 0);
            output = Math.min(output, 180);
            return Number(output);
        },
        
	});
});
