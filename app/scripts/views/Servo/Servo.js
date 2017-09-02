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
                activeOut: false,
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
			//window.setTimeout(function() {
				//this.deviceType = "ArduinoUno";
			//}.bind(this), 3000);
		},

		onModelChange: function(model) {
			for(var i=this.sources.length-1; i>=0; i--) {
				this.syncWithSource(this.sources[i].model);
			}


			var changed = model.changedAttributes();

			if(changed) {
				if(changed.server) {
					this.model.set({server: changed.server, activeOut: false});
				}
				if(changed.port) {
					this.model.set({port: changed.port, activeOut: false});
				}

				if(changed.deviceType) {
					this.model.set({deviceType: changed.deviceType, activeOut: false});
					if(!app.server) {
						if (changed.deviceType == "mkr1000") {
							this.$('.deviceIp').show();
						} else 
							{
								this.$('.deviceIp').hide();
							}
					}
				}

				var inactiveModels = this.inactiveModelsExist();

				// If we haven't made the hardware model yet, then we should bind everything together
				if( inactiveModels && this.model.get("activeOut") == true ) {
					var sourceField = this.sources[0] !== undefined ? this.sources[0].map.sourceField : this.model.get('inputMapping'),
						modelType = this.getDeviceModelType();

					this.unMapHardwareInlet();

					var server = this.getDeviceServerName();
					var port = this.getDeviceServerPort();

					// We do NOT pass a "model" attribute indicating hardware widget
					app.Patcher.Controller.mapToModel({
						view: this,
						modelType: modelType,
						//IOMapping: {sourceField: "out", destinationField: 'D3'},
						IOMapping: {sourceField: "out", destinationField: this.model.get('outputMapping')},
						server: server + ":" + port,
					}, true);

					this.enableDevice();
				}
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

        //onModelChange: function(model) {
            //var deviceMode = this.deviceMode;
            //var port = this.model.get('outputMapping');
            //var deviceType = this.deviceType;
            
            //if (!this.init && !app.serverMode && deviceMode !== undefined && port != '' && deviceType !== undefined) {
              ////console.log('servo trigger hardwareSwitch');
              ////console.log(deviceMode, port, deviceType, app.serverMode);
              //window.app.vent.trigger('Widget:hardwareSwitch', {
                //deviceType: deviceType,
                //port: port,
                //mode: deviceMode,
                //hasInput: true
              //});
             //this.init = true;
            //}
		//},
		getDeviceModelType: function() {return this.model.get('deviceType') === undefined ? 'ArduinoUno' : this.model.get('deviceType')},
		getDeviceServerName: function() {return this.model.get('server') == undefined ? '127.0.0.1' : this.model.get('server')},
		getDeviceServerPort: function() {return this.model.get('port') == undefined ? 9001 : this.model.get('port')},
		inactiveModelsExist: function checkForInactiveModels() {
			var inactiveModels = false;

			if(this.sources.length > 0) {
				for(var i=this.sources.length-1; i>=0; i--) {
					var source = this.sources[i];

					if(source.model.active === false) {
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
		//enableDevice: function enableHardware() {
			//var modelType = this.getDeviceModelType() + ":" + this.getDeviceServerName() + ":" + this.getDeviceServerPort();

			//window.app.vent.trigger('sendDeviceModelUpdate', {modelType: modelType, model: this.model.attributes, modeRequested: 4});
		//},
		enableDevice: function enableHardware() {
			var modelType = this.getDeviceModelType() + ":" + this.getDeviceServerName() + ":" + this.getDeviceServerPort();

			window.app.vent.trigger('sendDeviceModelUpdate', {modelType: modelType, model: this.model.attributes, modeRequested: 4});
			var hasInput = (this.deviceMode == 'in');

			window.app.vent.trigger('Widget:hardwareSwitch', {
				deviceType: this.getDeviceModelType() + ":" + this.getDeviceServerName() + ":" + this.getDeviceServerPort(),
				port: this.model.get("outputMapping"),
				mode: this.deviceMode,
				hasInput: hasInput
			});
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
