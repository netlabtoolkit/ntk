define([
	'backbone',
    'rivets',
	'views/item/WidgetMulti',
	'text!./template.js',
    'jqueryknob',

],
function(Backbone, rivets, WidgetView, Template, jqueryknob){
	'use strict';

	return WidgetView.extend({
		typeID: 'AnalogOut',
		deviceMode: 'PWM',
		categories: ['hardware', 'output'],
		className: 'analogOut',
		template: _.template(Template),

		ins: [
			{title: 'input', to: 'in'},
		],
		outs: [
			{title: 'output', from: 'in', to: 'out'},
		],
		sources: [],
		initialize: function(options) {
			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);
			this.model.set({
				title: 'AnalogOut',
				outputMapping: options.outputMapping,
                activeOut: false,
			});

            this.signalChainFunctions.push(this.limitRange);

			// This is here because this widget effectively does not output (only outputs to hardware and then, only on server)
			// So we go ahead and process so the output can be shown in the widget
			//if(!app.server) {
				this.model.on('change', this.processSignalChain, this);
			//}
		},

        onRender: function() {
			// always call the superclass
            WidgetView.prototype.onRender.call(this);

            var self = this;

            this.$('.dial').knob({
				'fgColor':'#000000',
				'bgColor':'#ffffff',
				'inputColor' : '#000000',
				'angleOffset':-125,
				'angleArc':250,
				'width':80,
				'height':62,
				'font':"'Helvetica Neue', sans-serif",
				'displayInput':false,
				'min': 0,
				'max': 255,
				'change' : function (v) { self.model.set('in', parseInt(v)); }
			});

			rivets.binders.knob = function(el, value) {
				el.value = value;
				$(el).val(value);
				$(el).trigger('change');
			};
        },

        limitRange: function(input) {
            var output = input;
            output = Math.max(output, 0);
            output = Math.min(output, 255);
            return Number(output);
        },
	});
});
