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
            'click .enableDevice': 'enableDevice',
            'change .smoothingAmount': 'smoothingAmtChange',
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
		typeID: 'AnalogIn',
		className: 'analogIn',
		categories: ['I/O'],
		template: _.template(Template),
		initialize: function(options) {
			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);

			this.model.set({
				title: 'AnalogIn',
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
            
            this.localProcessSignalChain = function() {
				this.processSignalChain();
			}.bind(this);

			// Register the signal chain to be updated at frame rate
			window.app.timingController.registerFrameCallback(this.localProcessSignalChain, this);

            // If you would like to register any function to be called at frame rate (60fps)
			this.localTimeKeeperFunc = function(frameCount) {
				this.timeKeeper(frameCount);
			}.bind(this);

			window.app.timingController.registerFrameCallback(this.localTimeKeeperFunc, this);
		},
		onModelChange: function(model) {
			var changed = model.changedAttributes();

			if(changed) {
				if(changed.server) {
					this.model.set({server: changed.server, active: false});
				}
				if(changed.port) {
					this.model.set({port: changed.port, active: false});
				}

				if(changed.deviceType) {
					this.model.set({deviceType: changed.deviceType, active: false});
				}

				// Check if there are any inactive models that we will need to activate
				var inactiveModels = this.inactiveModelsExist();

				if( inactiveModels && this.model.get("active") == true ) {
					var sourceField = this.sources[0] !== undefined ? this.sources[0].map.sourceField : this.model.get('inputMapping'),
						modelType = this.model.get('deviceType') === undefined ? 'ArduinoUno' : this.model.get('deviceType');

					// DIFF
					this.unMapHardwareInlet();

					var server = this.model.get('server') == undefined ? 'localhost' : this.model.get('server');
					var port = this.model.get('port') == undefined ? 9001 : this.model.get('port');

					app.Patcher.Controller.mapToModel({
						view: this,
						modelType: modelType,
						IOMapping: {sourceField: sourceField, destinationField: 'in'},
						server: server + ":" + port,
					}, true);

						this.enableDevice({modelType: modelType + ":" + server + ":" + port });

				}
			}
		},
		inactiveModelsExist: function checkForInactiveModels() {
			var inactiveModels = false;

			if(this.sources.length > 0) {
				for(var i=this.sources.length-1; i>=0; i--) {
					var source = this.sources[i];

					if(!source.model.active) {
						inactiveModels = true;
					}
				}
			}

			return inactiveModels;
		},
		unMapHardwareInlet: function unMapHardwareInlet() {

			this.sourceToRemove = this.sources[0];
			this.sources.length = 0;
			this.sources = [];

			if(this.sourceToRemove) {
				window.app.vent.trigger('Widget:removeMapping', this.sourceToRemove, this.model.get('wid') );
			}
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
			window.app.timingController.removeFrameCallback(this.localProcessSignalChain, this);
            window.app.timingController.removeFrameCallback(this.localTimeKeeperFunc, this);
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

		enableDevice: function enableHardware(options) {
			window.app.vent.trigger('sendDeviceModelUpdate', {modelType: options.modelType, model: this.model.attributes});
		},

	});
});


