define([
	'backbone',
	'rivets',
	'utils/SignalChainFunctions',
	'views/item/WidgetMulti',
	'text!tmpl/AnalogIn_tmpl.js',
	'jqueryknob',
],
function(Backbone, rivets, SignalChainFunctions, WidgetView, Template, jqueryknob){
    'use strict';

	return WidgetView.extend({
		widgetEvents: {
			'click .invert': 'toggleInvert',
		},
		ins: [
            {
                title: 'in',
                name: 'in',
                fieldMap: 'outblah',
            }
		],
		outs: [
			{title: 'out', name: 'in', fieldMap: 'out'},
		],
		className: 'analogIn',
		template: _.template(Template),
		initialize: function(options) {
			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);
			this.model.set('title', 'Analog In');

            this.signalChainFunctions.push(SignalChainFunctions.scale);
            this.signalChainFunctions.push(SignalChainFunctions.invert);
		},

		onRender: function() {
			WidgetView.prototype.onRender.call(this);
			var self = this;

			this.$('.dial').knob({
				'fgColor':'#000000',
				'bgColor':'#ffffff',
				'inputColor' : '#000000',
				'angleOffset':-125,
				'angleArc':250,
				'width':100,
				'height':80,
				'font':"'Helvetica Neue', sans-serif",
				'displayInput':false,
				'min': 0,
				'max': 1023,
				'change' : function (v) { self.model.set('in', v); }
			});


			rivets.binders.knob = function(el, value) {
				el.value = value;
				$(el).val(value);
				$(el).trigger('change');
			};


		},
		toggleInvert: function(e) {
			e.preventDefault();
			e.stopPropagation();
			this.model.set('invert', !this.model.get('invert'));
		},

	});
});


