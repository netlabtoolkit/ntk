define([
	'backbone',
	'rivets',
	'utils/SignalChainFunctions',
	'utils/SignalChainClasses',
	'views/item/WidgetMulti',
	'views/WidgetSettings',
	'text!./template.js',
	'jqueryknob',
],
function(Backbone, rivets, SignalChainFunctions, SignalChainClasses, WidgetView, WidgetSettingsView, Template, jqueryknob){
	'use strict';

	return WidgetView.extend({
		widgetEvents: {
			'click .invert': 'toggleInvert',
			'click .smoothing': 'toggleSmoothing',
            'click .easing': 'toggleEasing',
            'change .smoothingAmount': 'smoothingAmtChange',
		},
		ins: [
			{title: 'in', to: 'in'},
		],
		outs: [
			// title is decorative, from: <widget model field>, to: <widget model field being listened to>
			{title: 'out', from: 'in', to: 'out'},
		],
		typeID: 'Process',
		className: 'process',
        categories: ['logic'],
		template: _.template(Template),
		initialize: function(options) {
			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);

			this.model.set({
				title: 'Process',
				easing: false,
				easingAmount: 30,
				smoothingAmount: 60

			});

			this.easingLast = 0;

			this.signalChainFunctions.push(SignalChainFunctions.scale);
			this.signalChainFunctions.push(SignalChainFunctions.invert);
            this.signalChainFunctions.push(this.easing);

			// Create a Smoother instance that averages values over time
			// then push its processing function onto the stack
			this.smoother = new SignalChainClasses.Smoother({tolerance: this.model.get('smoothingAmount')});
			this.signalChainFunctions.push(this.smoother.getChainFunction());

			// Register the signal chain to be updated at frame rate
			window.app.timingController.registerFrameCallback(this.processSignalChain, this);

            // If you would like to register any function to be called at frame rate (60fps)
			window.app.timingController.registerFrameCallback(this.timeKeeper, this);
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
			window.app.timingController.removeFrameCallback(this.processSignalChain, this);
            window.app.timingController.removeFrameCallback(this.timeKeeper, this);
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

        toggleEasing: function(e) {
			e.preventDefault();
			e.stopPropagation();
			this.model.set('easing', !this.model.get('easing'));
		},

		easing: function(input) {
			this.easingNew = input;
			if (this.model.get('easing')) {
				if (isNaN(this.easingLast)) {
					this.easingLast = this.easingNew;
				}
				return this.easingLast;
			} else {
				return input;
			}
		},

		easeOutExpo: function(t, b, c, d) {
			return c * (-Math.pow(2, -10 * t/d) + 1) + b;
		},

		timeKeeper: function(frameCount) {
			if (this.model.get('easing')) {
				this.easingLast = this.easeOutExpo (0.17,this.easingLast,(this.easingNew - this.easingLast), this.model.get('easingAmount'));
				if (Math.abs(this.easingLast - this.easingNew) < 0.4) this.easingLast = this.easingNew;
				if (isNaN(this.easingLast)) {
					this.easingLast = this.easingNew;
				}
			} else {
				this.easingLast = this.easingNew;
			}
		},

		smoothingAmtChange: function(e) {
			this.smoother.setBufferLength(this.model.get('smoothingAmount'));
		},

	});
});


