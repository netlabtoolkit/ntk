define([
	'backbone',
    'rivets',
	'views/item/WidgetMulti',
	'text!./template.js',

	'utils/SignalChainFunctions',
	'utils/SignalChainClasses',
],
function(Backbone, rivets, WidgetView, Template, SignalChainFunctions, SignalChainClasses){
    'use strict';

	return WidgetView.extend({
		// Define the inlets
		ins: [
		],
		outs: [
			// title is decorative, from: <widget model field>, to: <widget model field being listened to>
			{title: 'out', from: 'in', to: 'out'},
		],
        // Any custom DOM events should go here (Backbone style)
        widgetEvents: {},
		// typeID us the unique ID for this widget. It must be a unique name as these are global.
		typeID: 'OSCIn',
		deviceMode: 'in',
		lastChanged: {in: 99},
		className: 'oscIn',
		categories: ['Network'],
		template: _.template(Template),

		initialize: function(options) {
			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);

            // Call any custom DOM events here
			this.model.set({
				title: 'OSCIn',
				messageName: '/ntk/in/1',
                port: 57190,
                active: true,
			});

            this.signalChainFunctions.push(SignalChainFunctions.scale);

            // Register the signal chain to be updated at frame rate
			window.app.timingController.registerFrameCallback(this.processSignalChain, this);

			this.model.on('change', function(model) {
				var changed = model.changedAttributes();

				if(changed.messageName !== undefined) {

					for(var i=this.sources.length-1; i>=0; i--) {
						var source = model.get('messageName');
						this.sources[i].map.sourceField = source;
						this.model.set('outputMapping', source);
					}

					window.app.vent.trigger('updateModelMappings', window.app.Patcher.Controller.widgetMappings);
			   }
			}, this);

			window.setTimeout(function() {
				window.app.vent.trigger('Widget:hardwareSwitch', {deviceType: 'OSC', mode: 'in', port: this.model.get('outputMapping') });
			}.bind(this), 200);
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
		//onModelChange: function onModelChange(model) {
			//var outputMapping = model.changedAttributes().outputMapping;

			//for(var i=this.sources.length-1; i>=0; i--) {
				//this.syncWithSource(this.sources[i].model);
			//}

			//if(outputMapping) {
				//// If a change has occurred make sure to send the change along to the server so we can switch pin modes if needed
				//// Do this for all sources and include the address of the source
				//for(var i=this.sources.length-1; i>=0; i--) {
					//for(var port in outputMapping) {
						//window.app.vent.trigger('Widget:hardwareSwitch', {deviceType: this.sources[i].model.get('type'), port: port, mode: this.deviceMode} );
					//}
				//}
			//}
		//},

		onModelChange: function(model) {
			for(var i=this.sources.length-1; i>=0; i--) {
				this.syncWithSource(this.sources[i].model);
			}

			var changed = model.changedAttributes();

			// This must NOT be gated by the this.lastChanged['in'] throttle below: that
			// compares only the 'in' key across calls, so once any change has occurred whose
			// changedAttributes lacked 'in' (e.g. the widget's own initial construction-time
			// setup), every later change that also lacks 'in' - including a port/server edit -
			// reads as no different (undefined === undefined) and gets silently skipped.
			//
			// A plain field edit doesn't make inactiveModelsExist() true (that only tracks the
			// shared hardware model's own .active flag, not this widget's fields), so without
			// this, editing server/port after creation updates the display only - the widget
			// stays bound to whichever hardware-model instance (and thus port) it had at
			// creation time. Force a rebind directly when either actually changes.
			// Gated on sources.length: initialize()'s own initial model.set() (which sets port
			// too) fires this same 'change' handler synchronously mid-construction, before the
			// widget has a source (or even exists on the canvas yet) - without this guard,
			// remapping+render() would run prematurely and break creation.
			if(changed && (changed.server !== undefined || changed.port !== undefined) && this.sources.length > 0) {
				this.unMapHardwareInlet();

				var server = this.getDeviceServerName(),
					port = this.getDeviceServerPort();

				app.Patcher.Controller.mapToModel({
					view: this,
					modelType: this.getDeviceModelType(),
					IOMapping: {sourceField: this.model.get('messageName'), destinationField: 'in'},
					server: server + ":" + port,
				}, true);

				this.enableDevice();
			}

			if(changed && (this.lastChanged['in'] !== changed['in']) ) {
				this.lastChanged = changed;

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
				if( inactiveModels && this.model.get("active") == true ) {
					var sourceField = this.sources[0] !== undefined ? this.sources[0].map.sourceField : this.model.get('inputMapping'),
						modelType = this.getDeviceModelType();

					this.unMapHardwareInlet();

					var server = this.getDeviceServerName();
					var port = this.getDeviceServerPort();

					app.Patcher.Controller.mapToModel({
						view: this,
						modelType: modelType,
						IOMapping: {sourceField: sourceField, destinationField: 'in'},
						server: server + ":" + port,
					}, true);

					this.enableDevice();

					// We do NOT pass a "model" attribute indicating hardware widget
					//app.Patcher.Controller.mapToModel({
						//view: this,
						//modelType: modelType,
						////IOMapping: {sourceField: "out", destinationField: 'D3'},
						//IOMapping: {sourceField: "out", destinationField: this.model.get('outputMapping')},
						//server: server + ":" + port,
					//}, true);

					//this.enableDevice();
				}
			}
		},
		unMapHardwareInlet: function unMapHardwareInlet() {

			this.sourceToRemove = this.sources[0];
			this.sources.length = 0;
			this.sources = [];

			if(this.sourceToRemove) {
				window.app.vent.trigger('Widget:removeMapping', this.sourceToRemove, this.model.get('wid') );
			}
		},
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
		getDeviceModelType: function() {return this.model.get('deviceType') === undefined ? 'OSC' : this.model.get('deviceType')},
		getDeviceServerName: function() {return ((this.model.get('server') == undefined) || (this.model.get('server') === true) ) ? '127.0.0.1' : this.model.get('server')},
		getDeviceServerPort: function() {return this.model.get('port') == undefined ? 57190 : this.model.get('port')},
		enableDevice: function enableHardware() {
			// TODO: Hack for now due to hardware usually being triggered from edit mode.
			// Temporarily dipping into edit mode for now. See SocketAdapter:registerOutboundClientEvents
			var switchBack = false;
			if(window.app.serverMode == true) {
				window.app.serverMode = false;
				switchBack = true;
			}

			var modelType = this.getDeviceModelType() + ":" + this.getDeviceServerName() + ":" + this.getDeviceServerPort();
			window.app.vent.trigger('sendDeviceModelUpdate', {modelType: modelType, model: this.model.attributes});

			(switchBack === true) && (window.app.serverMode = true);
		},

	});
});
