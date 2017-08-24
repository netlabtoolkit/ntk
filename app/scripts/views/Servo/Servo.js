define([
	'backbone',
    'rivets',
	'views/item/WidgetMulti',
	'text!./template.js',

	// If you would like signal processing classes and functions include them here
	'utils/SignalChainFunctions',
	'utils/SignalChainClasses',
	// and any other imported libraries you like should go here
    'jqueryknob',
],
function(Backbone, rivets, WidgetView, Template, SignalChainFunctions, SignalChainClasses, jqueryknob){
    'use strict';

	return WidgetView.extend({
		// Define the inlets
		ins: [
			// title is decorative, to: <widget model field being set by inlet>
			{title: 'in', to: 'in'},
		],
		outs: [
			// title is decorative, from: <widget model field>, to: <widget model field being listened to>
			{title: 'out', from: 'in', to: 'out'},
		],
        // Any custom DOM events should go here (Backbone style)
        widgetEvents: {},
		// typeID us the unique ID for this widget. It must be a unique name as these are global.


		typeID: 'Servo',
		deviceMode: 'SERVO',
		categories: ['I/O'],
		className: 'servo',
		pinMode: 4,
		template: _.template(Template),

		initialize: function(options) {
			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);

            // Call any custom DOM events here

            this.model.set({
				title: 'Servo',
				outputMapping: options.outputMapping,
                activeOut: true,
			});

            // If you want to register your own signal processing function, push them to signalChainFunctions
			this.signalChainFunctions.push(this.limitRange);

			// Likewise, if you need to register an instance-based processor
			//this.smoother = new SignalChainClasses.Smoother({tolerance: 50});
			//this.signalChainFunctions.push(this.smoother.getChainFunction());

			// If you would like to register any function to be called at frame rate (60fps)
			//window.app.timingController.registerFrameCallback(this.processSignalChain, this);

			// This is here because this widget effectively does not output (only outputs to hardware and then, only on server)
			// So we go ahead and process so the output can be shown in the widget
			//if(!app.server) {
				this.model.on('change', this.processSignalChain, this);
			//}
      window.setTimeout(function() {
				//this.deviceType = this.sources[0].model.get('type');
        this.deviceType = "ArduinoUno";
        //console.log(this.deviceType);
			}.bind(this), 3000);
		},

		onModelChange: function(model) {
			for(var i=this.sources.length-1; i>=0; i--) {
				this.syncWithSource(this.sources[i].model);
			}
		},
		/**
		 * Called when widget is rendered
		 * Most of your custom binding and functionality will happen here
		 *
		 * @return {void}
		 */
        onRender: function() {
			// always call the superclass
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
      this.init = false;

        },

        onModelChange: function(model) {
            var deviceMode = this.deviceMode;
            var port = this.model.get('outputMapping');
            var deviceType = this.deviceType;
            
            if (!this.init && !app.serverMode && deviceMode !== undefined && port != '' && deviceType !== undefined) {
              //console.log('servo trigger hardwareSwitch');
              //console.log(deviceMode, port, deviceType, app.serverMode);
              window.app.vent.trigger('Widget:hardwareSwitch', {
                deviceType: deviceType,
                port: port,
                mode: deviceMode,
                hasInput: true
              });
             this.init = true;
            }
    		},
		getDeviceModelType: function() {return this.model.get('deviceType') === undefined ? 'ArduinoUno' : this.model.get('deviceType')},
		getDeviceServerName: function() {return this.model.get('server') == undefined ? '127.0.0.1' : this.model.get('server')},
		getDeviceServerPort: function() {return this.model.get('port') == undefined ? 9001 : this.model.get('port')},
		enableDevice: function enableHardware() {
			let modelType = this.getDeviceModelType() + ":" + this.getDeviceServerName() + ":" + this.getDeviceServerPort();

			window.app.vent.trigger('sendDeviceModelUpdate', {modelType: modelType, model: this.model.attributes, modeRequested: 4});
		},


		// Any custom function can be attached to the widget like this "limitRange" function
		// and can be accessed via this.limitRange();
        limitRange: function(input) {
            var output = input;
            output = Math.max(output, 0);
            output = Math.min(output, 180);
            return Number(output);
        },

	});
});
