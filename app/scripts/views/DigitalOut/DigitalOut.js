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
			});

            this.signalChainFunctions.push(this.limitRange);

			// This is here because this widget effectively does not output (only outputs to hardware and then, only on server)
			// So we go ahead and process so the output can be shown in the widget
			//if(!app.server) {
				this.model.on('change', this.processSignalChain, this);
			//}

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
		getDeviceModelType: function() {return this.model.get('deviceType') === undefined ? 'ArduinoUno' : this.model.get('deviceType')},
		getDeviceServerName: function() {return ((this.model.get('server') == undefined) || (this.model.get('server') === true) ) ? '127.0.0.1' : this.model.get('server')},
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

			window.app.vent.trigger('sendDeviceModelUpdate', {modelType: modelType, model: outputModel, modeRequested: 3});
		},
        onRender: function() {
			// always call the superclass
            WidgetView.prototype.onRender.call(this);

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
				'change' : function (v) { this.model.set('in', parseInt(v)); }.bind(this)
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
