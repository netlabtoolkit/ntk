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
		typeID: 'DigitalOut',
		deviceMode: 'OUTPUT',
		pinMode: 3,
		categories: ['I/O'],
		className: 'digitalOut',
		template: _.template(Template),
		widgetEvents: {
			'mousedown .serialPortPicker': 'requestSerialPorts',
		},

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
				title: 'DigitalOut',
				outputMapping: options.outputMapping,
                activeOut: true,
				port: this.model.get('port') || 3030,
				threshold: this.model.get('threshold') || 512,
			});

            this.signalChainFunctions.push(this.applyThreshold);

			// This is here because this widget effectively does not output (only outputs to hardware and then, only on server)
			// So we go ahead and process so the output can be shown in the widget
			//if(!app.server) {
				this.model.on('change', this.processSignalChain, this);
			//}

			this.onSerialPortList = function(ports) {
				this.updateSerialPortOptions(ports);
			}.bind(this);
			window.app.vent.on('serialPortList', this.onSerialPortList);

			if(this.getDeviceModelType() === 'ArduinoUno') {
				this.requestSerialPorts();
			}
		},
		requestSerialPorts: function() {
			window.app.vent.trigger('listSerialPorts');
		},
		updateSerialPortOptions: function(ports) {
			var $select = this.$('.serialPortSelect'),
				currentValue = this.model.get('server');

			$select.find('option.detectedPort').remove();

			_.each(ports, function(port) {
				var label = port.manufacturer ? port.path + ' (' + port.manufacturer + ')' : port.path;
				$select.append('<option class="detectedPort" value="' + port.path + '">' + label + '</option>');
			});

			if(ports.length === 1 && (currentValue === undefined || currentValue === 'auto')) {
				this.model.set('server', ports[0].path);
			}

			$select.val(this.model.get('server') || 'auto');
		},
		onRemove: function() {
			window.app.vent.off('serialPortList', this.onSerialPortList);
		},

		//onModelChange: function(model) {
			//for(var i=this.sources.length-1; i>=0; i--) {
				//this.syncWithSource(this.sources[i].model);
			//}
		//},
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
					// Network vs. serial field visibility is handled declaratively
					// in the template (rv-class-networkmode on widget:deviceType) -
					// see AnalogIn.js for why this can't be an imperative
					// $(...).show()/hide() toggle here (Rivets' own rv-show/rv-hide
					// can't reveal an element whose CSS default is display:none).
					// Serial port enumeration still needs an explicit request,
					// though - rivets can't trigger that.
					if(!app.server && changed.deviceType !== "network") {
						this.requestSerialPorts();
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
		getDeviceModelType: function() {return this.model.get('deviceType') === undefined ? 'ArduinoUno' : this.model.get('deviceType')},
		getDeviceServerName: function() {
			var server = this.model.get('server');
			if(server !== undefined && server !== true) return server;
			return this.getDeviceModelType() === 'ArduinoUno' ? 'auto' : '127.0.0.1';
		},
		getDeviceServerPort: function() {return this.model.get('port') == undefined ? 3030 : this.model.get('port')},
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
		enableDevice: function enableHardware() {
			var modelType = this.getDeviceModelType() + ":" + this.getDeviceServerName() + ":" + this.getDeviceServerPort();

			//window.app.vent.trigger('sendDeviceModelUpdate', {modelType: modelType, model: this.model.attributes, modeRequested: 3});
			var outputModel = {};
			outputModel[this.model.get('outputMapping')] = this.model.get("out");

			var hasInput = (this.deviceMode == 'in');

			window.app.vent.trigger('Widget:hardwareSwitch', {
				deviceType: this.getDeviceModelType() + ":" + this.getDeviceServerName() + ":" + this.getDeviceServerPort(),
				port: this.model.get("outputMapping"),
				mode: this.deviceMode,
				hasInput: hasInput
			});

			// modeRequested: 1 (OUTPUT) - this widget's deviceMode is
			// 'OUTPUT', not PWM (3, which is AnalogOut's value - this was
			// copied from there and never updated).
			window.app.vent.trigger('sendDeviceModelUpdate', {modelType: modelType, model: outputModel, modeRequested: 1});
		},
        onRender: function() {
			// Must be registered before WidgetView.prototype.onRender below -
			// see CLAUDE.md's Rivets/Backbone gotcha. Same formatter name/
			// definition as AnalogIn.js - reusing it here is harmless since
			// rivets.formatters is a single global registry.
			if(!app.server) {
				rivets.formatters.isNetworkDeviceType = function(deviceType) {
					return deviceType === 'network';
				};
			}

			// always call the superclass
            WidgetView.prototype.onRender.call(this);

			if(this.getDeviceModelType() === 'ArduinoUno') {
				this.requestSerialPorts();
			}

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
				'change' : function (v) { this.model.set('in', parseInt(v)); }.bind(this)
			});

			rivets.binders.knob = function(el, value) {
				el.value = value;
				$(el).val(value);
				$(el).trigger('change');
			};
        },

        /**
         * Converts a continuous input into a clean binary output: 0
         * below the configured threshold, 1023 above it. 1023 (not a
         * literal 1) matches setHardwarePin's existing `value >= 255`
         * on/off check in StandardFirmataModel.js and NTK's general
         * convention of a 0-1023 "out" range, so no other code needs
         * to change to recognize it as "on".
         *
         * @param {number} input
         * @param {object} model
         * @return {number}
         */
        applyThreshold: function(input, model) {
            var value = parseFloat(input, 10);
            var threshold = parseFloat(model.threshold, 10);
            return value >= threshold ? 1023 : 0;
        },
	});
});
