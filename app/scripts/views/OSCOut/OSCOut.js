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
		typeID: 'OSCOut',
		deviceMode: 'out',
		categories: ['Network'],
		className: 'oscOut',
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
				title: "OSCOut",
                server: "127.0.0.1",
                port: 57120,
				messageName: options.outputMapping,
				outputMapping: options.outputMapping,
                activeOut: false,
			});

            //this.signalChainFunctions.push(this.limitRange);

			// This is here because this widget effectively does not output (only outputs to hardware and then, only on server)
			// So we go ahead and process so the output can be shown in the widget
			this.model.on('change', this.processSignalChain, this);
			this.model.on('change', function(model) {
				var changed = model.changedAttributes();

				if(changed.server !== undefined
				   || changed.port !== undefined
				   || changed.messageName !== undefined) {

					   for(var i=this.sources.length-1; i>=0; i--) {
						   var destination = model.get('messageName') + ":" + model.get( 'server' ) + ":" + model.get( 'port' );
						   this.sources[i].destinationField = destination;
						   model.set('outputMapping', destination);
					   }
			   }
			}, this);
		},

		getDeviceModelType: function() {return this.model.get('deviceType') === undefined ? 'OSC' : this.model.get('deviceType')},
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
		enableDevice: function enableHardware() {
			var modelType = this.getDeviceModelType() + ":" + this.getDeviceServerName() + ":" + this.getDeviceServerPort();

			window.app.vent.trigger('sendDeviceModelUpdate', {modelType: modelType, model: this.model.attributes, modeRequested: 3});
			var hasInput = (this.deviceMode == 'in');

			window.app.vent.trigger('Widget:hardwareSwitch', {
				deviceType: this.getDeviceModelType() + ":" + this.getDeviceServerName() + ":" + this.getDeviceServerPort(),
				port: this.model.get("outputMapping"),
				mode: this.deviceMode,
				hasInput: hasInput
			});


			var messageAddress = this.model.get('outputMapping');
			app.Patcher.Controller.hardwareModelInstances["OSC:127.0.0.1:9001"].model.attributes.outputs[messageAddress] = this.model.get('in');
			app.Patcher.Controller.hardwareModelInstances["OSC:127.0.0.1:9001"].model.attributes[messageAddress] = this.model.get('in');
		},
		unMapHardwareInlet: function unMapHardwareInlet() {

			this.sourceToRemove = this.sources[0];
			this.sources.length = 0;
			this.sources = [];

			if(this.sourceToRemove) {
				window.app.vent.trigger('Widget:removeMapping', this.sourceToRemove, this.model.get('wid') );
			}
		},
		onModelChange: function(model) {
			for(var i=this.sources.length-1; i>=0; i--) {
				this.syncWithSource(this.sources[i].model);
			}

			var changed = model.changedAttributes();

			if(changed) {

				var inactiveModels = this.inactiveModelsExist();

				if(changed.server) {
					this.model.set({server: changed.server, activeOut: false});
				}
				if(changed.port) {
					this.model.set({port: changed.port, activeOut: false});
				}


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
						IOMapping: {sourceField: "out", destinationField: this.model.get('outputMapping')},
						server: server + ":" + port,
					}, true);

					this.enableDevice();

					//if(changed['messageName'] !== undefined || changed.server !== undefined || changed.port !== undefined) {
						// add the message to the outputs of the OSC hardware device
					//}
				}

				if(app.Patcher.Controller.hardwareModelInstances["OSC:127.0.0.1:9001"] !== undefined) {
					if((changed['messageName'] !== undefined) || (changed.server !== undefined) || (changed.port !== undefined) ) {
						// add the message to the outputs of the OSC hardware device
						var messageAddress = this.model.get('outputMapping');

						app.Patcher.Controller.hardwareModelInstances["OSC:127.0.0.1:9001"].model.attributes.outputs[messageAddress] = this.model.get('in');
						app.Patcher.Controller.hardwareModelInstances["OSC:127.0.0.1:9001"].model.attributes[messageAddress] = this.model.get('in');
					}
				}

				if(changed.messageName == '/ntk/out/1:127.0.0.1:57120') {
					this.model.set('messageName', '/ntk/out/1');
				}
			}
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
				'max': 1023,
				'change' : function (v) { this.model.set('in', parseFloat(v)); }.bind(this)
			});

			rivets.binders.knob = function(el, value) {
				el.value = value;
				$(el).val(value);
				$(el).trigger('change');
			};

			// SGC: OK, small hack for async issues
			window.setTimeout(function() {
			   window.app.vent.trigger('Widget:hardwareSwitch', {deviceType: 'OSC', mode: 'out', port: this.model.get('outputMapping'), hasInput: false });
			}.bind(this), 200);
        },

	});
});
