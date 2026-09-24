define([
	'backbone',
    'rivets',
	'views/item/WidgetMulti',
	'text!./template.js',
    'jqueryknob',

	'utils/SignalChainFunctions',
],
function(Backbone, rivets, WidgetView, Template, jqueryknob, SignalChainFunctions){
	'use strict';

	return WidgetView.extend({
		typeID: 'CloudOut',
		deviceMode: 'out',
		categories: ['network'],
		className: 'cloudOut',
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
				title: 'CloudOut',
				topic: '',
				outputMapping: '',
				host: '',
				port: 1883,
				tls: false,
				username: '',
				password: '',
				activeOut: false,
				cloudConnected: false,
				// 2000ms default - safe headroom under Adafruit IO's free
				// tier (30 points/min = 1 per 2s max); set to 0 for no
				// minimum on a self-hosted/unlimited broker. See
				// CloudModel.js's set() for where the actual throttle
				// (and averaging, below) lives.
				sendInterval: 2000,
				// Mirrors the OLD CloudOut's averageInputs option - when
				// on, publishes the mean of every value seen during the
				// sendInterval window instead of just the latest one.
				// Re-added 2026-09-24 per explicit request.
				averageInputs: false,
				// What the second numeric display actually shows - set
				// ONLY by onHardwarePublished, holding whatever was
				// actually last sent (average or settle value) until the
				// next real send. Deliberately does NOT track the live
				// dial (see plans/cloud-widgets.md for the back-and-forth
				// that landed here).
				displayOut: 0,
			});

            this.signalChainFunctions.push(SignalChainFunctions.roundToInt);

			// See AnalogOut.js - the widget effectively has no local
			// output of its own (it only writes out to the cloud, and
			// only from the server side), so processSignalChain still
			// needs to run on every change to keep the on-widget display
			// current.
			this.model.on('change', this.processSignalChain, this);

			this.model.on('change', function(model) {
				var changed = model.changedAttributes();

				if(changed.topic !== undefined) {
					this.model.set('outputMapping', model.get('topic'));
				}
			}, this);

			// Gated on this widget's own 'activeOut' toggle, not just the
			// shared broker connection's status - see CloudIn.js's
			// matching comment. lastStatusInfo lets re-checking
			// 'activeOut' immediately show the right state instead of
			// waiting for another 'status' event that may never come
			// again if the shared connection is already stable.
			this.lastStatusInfo = null;
			this.onHardwareStatus = function(data) {
				if (data.modelType === this.getHardwareKey()) {
					this.lastStatusInfo = data.info;
					this.model.set('cloudConnected', this.model.get('activeOut') === true && !!(data.info && data.info.connected));
				}
			}.bind(this);
			window.app.vent.on('hardwareStatus', this.onHardwareStatus);

			// Filtered on both modelType AND field - the shared broker
			// connection can carry other CloudOut widgets publishing to
			// different topics, whose 'published' events also arrive
			// here. displayOut is set here ONLY - it does NOT track the
			// live dial at all (see the removed model:change mirror
			// above) - it holds whatever was actually last sent
			// (average or settle value) and stays there until the next
			// real send, per explicit request: "show the just sent
			// value and stay there until the next send... shows the
			// average all the time at each interval and when settle
			// happens shows that value." The color flash is just a
			// brief attention cue on top of that, not what shows the
			// value - the number change itself is the persistent part.
			this.onHardwarePublished = function(data) {
				if (data.modelType === this.getHardwareKey() && data.field === this.model.get('outputMapping')) {
					this.model.set('displayOut', data.value);
					this.$('.outvalue').css('color', '#2e7d32');
					clearTimeout(this.publishFlashTimeout);
					this.publishFlashTimeout = setTimeout(function() {
						this.$('.outvalue').css('color', '');
					}.bind(this), 300);
				}
			}.bind(this);
			window.app.vent.on('hardwarePublished', this.onHardwarePublished);
		},
		onRemove: function() {
			window.app.vent.off('hardwareStatus', this.onHardwareStatus);
			window.app.vent.off('hardwarePublished', this.onHardwarePublished);
			clearTimeout(this.publishFlashTimeout);
		},
		// Overrides WidgetMulti.js's base setFromModel (called by
		// PatchLoader when a saved patch loads) - the base version
		// restores activeOut exactly as saved and auto-calls
		// enableDevice() if it was true, which for every OTHER output
		// widget just means "resume driving the pin/message it already
		// had". For CloudOut that means silently opening a real MQTT
		// connection and starting to publish again the moment a patch
		// loads - explicitly requested (2026-09-24) to NOT happen
		// automatically, since repeated test restarts kept re-consuming
		// a rate-limited broker's quota. CloudOut always loads
		// deactivated regardless of what was saved; the user re-checks
		// the box to reconnect deliberately.
		setFromModel: function(model) {
			this.$el.css({top: model.offsetTop, left: model.offsetLeft});
			var loadedModel = _.extend({}, model, {activeOut: false});
			this.model.set(loadedModel);
			this.model.set('active', loadedModel.active);
			this.model.set('activeOut', false);
			return this;
		},
		getHardwareKey: function() {
			return 'Cloud:' + (this.model.get('host') || '') + ':' + (this.model.get('port') || 1883);
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
		// See CloudIn.js's matching helper for the full reasoning -
		// mapToModel's internal view.render() unconditionally hides the
		// "more" panel content, which closed it out from under the user
		// while editing fields inside it (found 2026-09-24).
		mapToModelKeepingPanelOpen: function(options) {
			var panelWasOpen = this.$('.widgetBottom .content').is(':visible');
			app.Patcher.Controller.mapToModel(options, true);
			if (panelWasOpen) {
				this.$('.widgetBottom .content').show();
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
		enableDevice: function enableHardware() {
			var modelType = this.getHardwareKey();
			var outputModel = {};
			outputModel[this.model.get('outputMapping')] = this.model.get('out');

			window.app.vent.trigger('Widget:hardwareSwitch', {
				deviceType: modelType,
				port: this.model.get('outputMapping'),
				mode: 'out',
				hasInput: false,
				username: this.model.get('username'),
				password: this.model.get('password'),
				tls: this.model.get('tls'),
				// The real throttle (and averaging) lives server-side now
				// (CloudModel.js's set()) - see that file for why. This
				// just tells it what interval/mode to use for this topic.
				sendInterval: this.model.get('sendInterval'),
				averageInputs: this.model.get('averageInputs'),
			});

			window.app.vent.trigger('sendDeviceModelUpdate', {modelType: modelType, model: outputModel, modeRequested: 3});
		},
		onModelChange: function(model) {
			for(var i=this.sources.length-1; i>=0; i--) {
				this.syncWithSource(this.sources[i].model);
			}

			var changed = model.changedAttributes();

			if (changed && changed.activeOut === false) {
				this.model.set('cloudConnected', false);
			} else if (changed && changed.activeOut === true) {
				this.model.set('cloudConnected', !!(this.lastStatusInfo && this.lastStatusInfo.connected));
			}

			if(changed) {
				// A host/port edit needs a real new MQTT connection - force
				// an explicit re-enable rather than silently reconnecting
				// under a topic that's still being typed. Same pattern
				// AnalogOut.js uses for server/port.
				if(changed.host !== undefined) {
					this.model.set({host: changed.host, activeOut: false});
				}
				if(changed.port !== undefined) {
					this.model.set({port: changed.port, activeOut: false});
				}

				var inactiveModels = this.inactiveModelsExist();

				// See AnalogOut.js's own comment on this exact condition -
				// the 2026-09-22 continuous-write-gap fix: activeOut
				// switching on has to re-run this even when
				// inactiveModelsExist() would say nothing changed
				// structurally.
				if( (inactiveModels || changed.activeOut === true) && this.model.get("activeOut") == true ) {
					this.unMapHardwareInlet();

					this.mapToModelKeepingPanelOpen({
						view: this,
						modelType: 'Cloud',
						IOMapping: {sourceField: "out", destinationField: this.model.get('outputMapping')},
						server: (this.model.get('host') || '') + ':' + (this.model.get('port') || 1883),
					});
					// mapToModel's addedFromLoader=true skips its own
					// updateModelMappings trigger, which left the
					// server's masterPatch.mappings never actually
					// learning about a Cloud connection - see CloudIn.js
					// for the fuller explanation of the pruning bug this
					// caused (found 2026-09-24: a shared broker
					// connection could get deleted and silently rebuilt
					// mid-flight the moment ANYTHING else in the patch
					// triggered a mapping sync).
					window.app.vent.trigger('updateModelMappings', window.app.Patcher.Controller.widgetMappings);

					this.enableDevice();
				}
			}
		},
        onRender: function() {
			// Must be registered before WidgetView.prototype.onRender
			// below - see CLAUDE.md's Rivets/Backbone gotcha.
			rivets.formatters.cloudStatusText = function(connected) {
				return connected ? 'Connected' : 'Not connected';
			};

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
        },

	});
});
