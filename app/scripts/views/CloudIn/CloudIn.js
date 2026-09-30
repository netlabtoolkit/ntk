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
		ins: [
		],
		outs: [
			{title: 'out', from: 'in', to: 'out'},
		],
		widgetEvents: {},
		typeID: 'CloudIn',
		deviceMode: 'in',
		lastChanged: {in: 99},
		className: 'cloudIn',
		categories: ['network'],
		template: _.template(Template),

		initialize: function(options) {
			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);

			this.model.set({
				title: 'CloudIn',
				topic: '',
				host: '',
				port: 1883,
				tls: false,
				username: '',
				password: '',
				// false to match CloudOut's activeOut default - starts
				// deactivated, user opts in explicitly (2026-09-24). The
				// underlying subscribe still gets established once
				// host+topic are set regardless of this flag (see the
				// topic-change listener below) - 'active' only gates
				// whether incoming values get applied locally and
				// whether the widget shows "Connected".
				active: false,
				cloudConnected: false,
			});

            this.signalChainFunctions.push(SignalChainFunctions.scale);

			window.app.timingController.registerFrameCallback(this.processSignalChain, this);

			this.model.on('change', function(model) {
				var changed = model.changedAttributes();

				if(changed.topic !== undefined) {
					for(var i=this.sources.length-1; i>=0; i--) {
						this.sources[i].map.sourceField = model.get('topic');
					}
					this.model.set('outputMapping', model.get('topic'));

					// Guarded on this.sources.length - PatchLoader.js sets
					// EVERY widget's full saved field data (via
					// setFromModel) in one loop BEFORE processing ANY
					// widget's mappings in a separate, later loop. Without
					// this guard, loading a saved patch with a real topic
					// fired this listener while
					// window.app.Patcher.Controller.widgetMappings was
					// still globally empty (no widget's mapping
					// established yet, not just this one's) - sending
					// updateModelMappings with an empty array wiped out
					// EVERY hardware connection's server-side registration,
					// including a different widget's (e.g. CloudOut's)
					// that had just been set up. Real regression found
					// 2026-09-24, traced via nlMultiClientSync.js's
					// pruneOrphanedHardwareModels logging
					// "stillReferencedKeys: []". this.sources is only
					// non-empty once THIS widget's own mapToModel has
					// actually run, which can't happen before the mapping
					// loop starts.
					if (this.sources.length > 0) {
						window.app.vent.trigger('updateModelMappings', window.app.Patcher.Controller.widgetMappings);
					}
				}

				// Actually (re-)send the subscribe request whenever any
				// connection-relevant field changes and a real topic
				// exists - not just on topic changing. The bootstrap
				// enableDevice() call from Patcher.js's onExternalAddWidget
				// fires at widget CREATION time, when every field (topic
				// AND username/password) is still blank - the server's
				// client:changeIOMode handler silently no-ops on an empty
				// topic, so that very first request never actually
				// subscribes to anything (found 2026-09-24). Originally
				// only re-fired on topic changing, which meant filling in
				// host+topic BEFORE username/password (a natural order)
				// sent one real request with blank credentials, got
				// rejected, and nothing ever retried with the real
				// credentials once they were filled in - CloudIn only
				// ever recovered if some OTHER widget's later, correctly-
				// credentialed connect happened to succeed first and
				// swept CloudIn's already-seeded topic into its resubscribe
				// (CloudModel.js's 'connect' handler). Found 2026-09-24,
				// second round - the credentials-ignored-after-topic gap.
				if (model.get('topic') && (changed.topic !== undefined || changed.host !== undefined
					|| changed.port !== undefined || changed.tls !== undefined
					|| changed.username !== undefined || changed.password !== undefined)) {
					this.enableDevice();
				}
			}, this);

			// Gated on this widget's own 'active' toggle, not just the
			// shared broker connection's status - the underlying MQTT
			// connection can legitimately stay up because another widget
			// (e.g. a CloudOut on the same broker) still needs it, but
			// THIS widget's own subscription is only actually live while
			// its own checkbox is on (see WidgetMulti.js's syncWithSource,
			// which only applies incoming values when 'active' is true) -
			// showing "Connected" regardless of this widget's own toggle
			// was confusing (2026-09-24).
			// lastStatusInfo lets re-checking 'active' immediately show
			// the right state, instead of waiting for another 'status'
			// event that may never come again if the shared connection
			// is already stable (see onModelChange's active===true
			// branch below).
			this.lastStatusInfo = null;
			this.onHardwareStatus = function(data) {
				if (data.modelType === this.getHardwareKey()) {
					this.lastStatusInfo = data.info;
					this.model.set('cloudConnected', this.model.get('active') === true && !!(data.info && data.info.connected));
				}
			}.bind(this);
			window.app.vent.on('hardwareStatus', this.onHardwareStatus);

			// No bootstrap Widget:hardwareSwitch trigger here (unlike
			// OSCIn.js, which this was originally modeled on) - Patcher.js's
			// onExternalAddWidget now calls mapToModel for a freshly-created
			// CloudIn, which auto-invokes enableDevice() once already
			// (deviceMode 'in' + active already true by this point in
			// construction). A second, redundant trigger here raced with
			// that one and could land while nlMultiClientSync.js's
			// pruneOrphanedHardwareModels was mid-cycle, recreating the
			// connection - found 2026-09-24.
		},
		onRender: function() {
			// Must be registered before WidgetView.prototype.onRender
			// below - see CLAUDE.md's Rivets/Backbone gotcha (a custom
			// formatter registered after the base onRender's bind pass
			// is silently never invoked).
			rivets.formatters.cloudStatusText = function(connected) {
				return connected ? 'Connected' : 'Not connected';
			};

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
		onRemove: function() {
			window.app.vent.off('hardwareStatus', this.onHardwareStatus);
		},
		// Overrides WidgetMulti.js's base setFromModel - see CloudOut.js's
		// matching override for the full reasoning. CloudIn always loads
		// deactivated regardless of what 'active' was saved as.
		setFromModel: function(model) {
			this.$el.css({top: model.offsetTop, left: model.offsetLeft});
			var loadedModel = _.extend({}, model, {active: false});
			this.model.set(loadedModel);
			this.model.set('active', false);
			return this;
		},
		// 'Cloud:<host>:<port>' - matches nlHardware/Hardware.js's dispatch
		// (deviceType 'Cloud' -> CloudModel.js) and nlMultiClientSync.js's
		// hardwareModels key. Deliberately does NOT include username - one
		// broker address is treated as one identity for all widgets that
		// reference it in a patch (see plans/cloud-widgets.md); the first
		// widget to connect sets the credentials the shared connection
		// uses, later widgets pointed at the same host:port share it.
		getHardwareKey: function() {
			return 'Cloud:' + (this.model.get('host') || '') + ':' + (this.model.get('port') || 1883);
		},
		// mapToModel calls view.render() internally, and WidgetMulti.js's
		// own onRender unconditionally hides the "more" panel's content
		// every time (`this.$(".widgetBottom .content").hide()`) - fine
		// for a widget that rarely reconnects, but CloudIn calls
		// mapToModel on host/port edits, which happen WHILE the user is
		// actively filling in fields inside that same panel. Without
		// this, typing the host then moving to the topic field closed
		// the panel out from under them mid-edit - found 2026-09-24.
		// Restoring visibility synchronously after mapToModel returns
		// works because render() completes before mapToModel does.
		mapToModelKeepingPanelOpen: function(options) {
			var panelWasOpen = this.$('.widgetBottom .content').is(':visible');
			app.Patcher.Controller.mapToModel(options, true);
			if (panelWasOpen) {
				this.$('.widgetBottom .content').show();
			}
		},
		onModelChange: function(model) {
			for(var i=this.sources.length-1; i>=0; i--) {
				this.syncWithSource(this.sources[i].model);
			}

			var changed = model.changedAttributes();

			// Flip the indicator immediately on either edge, rather than
			// waiting for a 'status' event that may not come again for a
			// while (the underlying broker connection can stay up for
			// another widget indefinitely, so re-checking 'active' with
			// an already-stable connection would otherwise never see a
			// fresh event to react to).
			if (changed && changed.active === false) {
				this.model.set('cloudConnected', false);
			} else if (changed && changed.active === true) {
				this.model.set('cloudConnected', !!(this.lastStatusInfo && this.lastStatusInfo.connected));

				// Checking the box should actually DO something, not just
				// change what gets displayed - CloudOut's checkbox
				// (activeOut) genuinely triggers a connection attempt;
				// CloudIn's never did, since the design relied entirely on
				// topic/host/etc field changes to (re)trigger enableDevice().
				// If the connection is down or was never established (e.g.
				// after a rate-limit disconnect, or before any field
				// changed since this widget loaded), checking the box had
				// no effect at all - found 2026-09-24. Harmless to call
				// unconditionally: CloudModel.js's connect() is a no-op on
				// an already-live connection with the same credentials.
				if (this.model.get('topic')) {
					this.enableDevice();
				}

				// Force a fresh pull from whatever value is ALREADY
				// cached on the shared hardware model, right now - a
				// retained/current value may have arrived earlier while
				// 'active' was still false (syncWithSource's own gate
				// skips applying it in that case, see WidgetMulti.js),
				// and a broker may not redeliver a retained message on a
				// redundant resubscribe. The value itself isn't lost
				// though (receivedDeviceModelUpdate applies it to the
				// shared model unconditionally) - this just re-reads
				// whatever's already sitting there instead of waiting on
				// a NEW message that might not come until the next
				// genuine publish. Found 2026-09-24: CloudIn only ever
				// updated once CloudOut changed again, never showing the
				// value that was already live at connect time.
				for(var i=this.sources.length-1; i>=0; i--) {
					this.syncWithSource(this.sources[i].model);
				}
			}

			// Same reasoning as OSCIn.js: must NOT be gated by the
			// lastChanged['in'] throttle below, or a host/port edit with
			// no 'in' key in this particular change gets silently
			// swallowed as "no different".
			if(changed && (changed.host !== undefined || changed.port !== undefined) && this.sources.length > 0) {
				this.unMapHardwareInlet();

				this.mapToModelKeepingPanelOpen({
					view: this,
					modelType: 'Cloud',
					IOMapping: {sourceField: this.model.get('topic'), destinationField: 'in'},
					server: (this.model.get('host') || '') + ':' + (this.model.get('port') || 1883),
				});
				// mapToModel's addedFromLoader=true skips its own
				// updateModelMappings trigger - fine for widgets that
				// don't otherwise need the SERVER's masterPatch.mappings
				// to know about this mapping right away, but a Cloud
				// connection does: nlMultiClientSync.js's
				// pruneOrphanedHardwareModels() runs on every mapping
				// sync (from ANY widget, not just this one) and deletes
				// any hardwareModels entry not referenced in that
				// server-side copy. Without this explicit sync, a shared
				// Cloud connection could get pruned and silently
				// recreated the moment anything else in the patch
				// triggers a mapping sync - found 2026-09-24 (CloudIn
				// showing "Connected" but never receiving data, because
				// its subscription kept landing on an instance that got
				// replaced out from under it).
				window.app.vent.trigger('updateModelMappings', window.app.Patcher.Controller.widgetMappings);

				this.enableDevice();
			}

			if(changed && (this.lastChanged['in'] !== changed['in']) ) {
				this.lastChanged = changed;

				var inactiveModels = this.inactiveModelsExist();

				if( inactiveModels && this.model.get("active") == true ) {
					var sourceField = this.sources[0] !== undefined ? this.sources[0].map.sourceField : this.model.get('inputMapping');

					this.unMapHardwareInlet();

					this.mapToModelKeepingPanelOpen({
						view: this,
						modelType: 'Cloud',
						IOMapping: {sourceField: sourceField, destinationField: 'in'},
						server: (this.model.get('host') || '') + ':' + (this.model.get('port') || 1883),
					});
					// See the other mapToModel call above for why this is
					// needed.
					window.app.vent.trigger('updateModelMappings', window.app.Patcher.Controller.widgetMappings);

					this.enableDevice();
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
		enableDevice: function enableHardware() {
			window.app.vent.trigger('Widget:hardwareSwitch', {
				deviceType: this.getHardwareKey(),
				port: this.model.get('topic'),
				mode: 'in',
				username: this.model.get('username'),
				password: this.model.get('password'),
				tls: this.model.get('tls'),
			});
		},

	});
});
