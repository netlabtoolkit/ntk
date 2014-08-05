define([
	'backbone',
	'rivets',
	'utils/SignalChainFunctions',
	'views/item/WidgetMulti',
	'views/WidgetSettings',
	'text!tmpl/AnalogIn_tmpl.js',
	'jqueryknob',
],
function(Backbone, rivets, SignalChainFunctions, WidgetView, WidgetSettingsView, Template, jqueryknob){
    'use strict';

	return WidgetView.extend({
		widgetEvents: {
			'click .invert': 'toggleInvert',
		},
		ins: [
            {
                title: 'in',
                from: 'in',
                to: 'outblah',
            }
		],
		outs: [
			{title: 'out', from: 'in', to: 'out'},
		],
		//sources: [],
		className: 'analogIn',
		template: _.template(Template),
		initialize: function(options) {
			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);
			this.model.set('title', 'Analog In');

            this.signalChainFunctions.push(SignalChainFunctions.scale);
            this.signalChainFunctions.push(SignalChainFunctions.invert);

			//this.settingsView = new WidgetSettingsView({model: this.model});
		},

		onRender: function() {
			WidgetView.prototype.onRender.call(this);
			//rivets.bind(this.$el, {widget: this.model, sources: this.sources});
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


