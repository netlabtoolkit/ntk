define([
	'backbone',
	'rivets',
	'utils/SignalChainFunctions',
	'utils/SignalChainClasses',
	'views/item/WidgetMulti',
	'views/WidgetSettings',
	'text!tmpl/AnalogIn_tmpl.js',
	'jqueryknob',
],
function(Backbone, rivets, SignalChainFunctions, SignalChainClasses, WidgetView, WidgetSettingsView, Template, jqueryknob){
	'use strict';

	return WidgetView.extend({
		widgetEvents: {
			'click .invert': 'toggleInvert',
			'click .smoothing': 'toggleSmoothing',
		},
		ins: [
			//{
				//title: 'in',
				//to: 'outblah',
			//}
		],
		outs: [
			// title is decorative, from: <widget model field>, to: <widget model field being listened to>
			{title: 'out', from: 'in', to: 'out'},
		],
		typeID: 'Analog In',
		className: 'analogIn',
		template: _.template(Template),
		initialize: function(options) {
			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);
			this.model.set('title', 'AnalogIn');

			this.signalChainFunctions.push(SignalChainFunctions.scale);
			this.signalChainFunctions.push(SignalChainFunctions.invert);

			// Create a Smoother instance that averages values over time
			// then push its processing function onto the stack
			this.smoother = new SignalChainClasses.Smoother({tolerance: 60});
			this.signalChainFunctions.push(this.smoother.getChainFunction());

			// Register the signal chain to be updated at frame rate
			window.app.timingController.registerFrameCallback(this.processSignalChain, this);
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
				'width':80,
				'height':62,
				'font':"'Helvetica Neue', sans-serif",
				'displayInput':false,
				'min': 0,
				'max': 1023,
				'change' : function (v) { self.model.set('in', parseInt(v)); }
			});


			rivets.binders.knob = function(el, value) {
				el.value = value;
				$(el).val(value);
				$(el).trigger('change');
			};


		},
		/**
		 * onRemove  - Called when the widget is removed. Used for cleanup.
		 *
		 * @return {void}
		 */
		onRemove: function() {
			window.app.timingController.removeFrameCallback(this.processSignalChain);
		},
		toggleInvert: function(e) {
			e.preventDefault();
			e.stopPropagation();
			this.model.set('invert', !this.model.get('invert'));
		},
		/**
		 * toggleSmoothing - toggle on/off signal smoothing
		 *
		 * @return
		 */
		toggleSmoothing: function(e) {
			e.preventDefault();
			e.stopPropagation();
			this.smoother.toggleActive();
			this.model.set('smoothing', this.smoother.active);
		},

	});
});


