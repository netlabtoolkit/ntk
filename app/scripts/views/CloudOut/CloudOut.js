define([
	'backbone',
    'rivets',
	'views/item/WidgetMulti',
	'text!./template.js',
    'jqueryknob',

	'utils/SignalChainFunctions',
	'utils/cloudStatus',
],
function(Backbone, rivets, WidgetView, Template, jqueryknob, SignalChainFunctions, cloudStatus){
	'use strict';

	return WidgetView.extend({
		typeID: 'CloudOut',
		deviceMode: 'out',
		categories: ['network'],
		className: 'cloudOut',
		template: _.template(Template),
		// Rivets only writes a text field back to the model on the DOM
		// 'change' event - i.e. once the field loses focus or Enter is
		// pressed - so typing a new username/password did nothing
		// visible until the user clicked somewhere else: the widget sat
		// there "Connected" with half a new password in the box (found
		// 2026-10-03: "making change to credential still doesn't
		// disconnect"). These push each keystroke to the model, so the
		// first character typed switches the widget off (see
		// onModelChange).
		widgetEvents: {
			'input input[name="username"]': 'onCredentialInput',
			'input input[name="password"]': 'onCredentialInput',
		},
		onCredentialInput: function(e) {
			this.model.set(e.currentTarget.name, e.currentTarget.value);
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
				// What the connection indicator shows - see
				// utils/cloudStatus.js.
				cloudStatusLabel: 'Not connected',
				cloudError: false,
				cloudErrorDetail: '',
				// 5000ms default (was 2000 until 2026-10-03) - Adafruit
				// IO's free tier allows 30 points/min, i.e. 1 per 2s at
				// most, so 2000 sat right on the limit with no headroom;
				// set to 0 for no minimum on a self-hosted/unlimited
				// broker. See CloudModel.js's set() for where the actual
				// throttle (and averaging, below) lives.
				sendInterval: 5000,
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
				// Countdown to the next possible send - restored
				// 2026-09-29 from the pre-MQTT-rewrite CloudOut, which had
				// this (plus the red flash restored below) before the
				// rewrite dropped both. Purely a local display computed
				// from lastPublishedAt (see onHardwarePublished) and
				// sendInterval, via updateSendCountdown()'s frame
				// callback below - not synced from the server, since the
				// 'published' broadcast every client already receives is
				// enough to keep this in sync on its own.
				sendCountdownText: '',
				// True while the "send in ..." countdown is running, i.e.
				// a new value would have to wait - shown in red (see
				// updateSendCountdown and Widget.scss's .sendpending).
				sendPending: false,
			});

            this.signalChainFunctions.push(SignalChainFunctions.roundToInt);

			// lastPublishedAt: instance state, not a model field - only
			// updateSendCountdown() below reads it, so there's no reason
			// to network-sync or persist it. 0 means "never published
			// yet this session" (updateSendCountdown treats that as
			// nothing to count down).
			this.lastPublishedAt = 0;
			this.localSendCountdownFunc = function(frameCount) {
				this.updateSendCountdown();
			}.bind(this);
			window.app.timingController.registerFrameCallback(this.localSendCountdownFunc, this);

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
					this.lastCloudError = cloudStatus.nextError(this.lastCloudError, data.info);
					this.lastTopicError = cloudStatus.topicErrorFor(this.lastTopicError, data.info, this.model.get('outputMapping'));
					this.model.set('cloudConnected', this.model.get('activeOut') === true && !!(data.info && data.info.connected));
					this.updateCloudStatus();
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
			// happens shows that value." The flash-then-fade is just a
			// brief attention cue on top of that, not what shows the
			// value - the number change itself is the persistent part.
			// Red (not the prior green) + an actual CSS fade (Widget.scss's
			// .cloudOut .outvalue transition), not an abrupt revert -
			// restored 2026-09-29 to match the pre-MQTT-rewrite CloudOut's
			// own flash-then-fade behavior (that version had no CSS
			// transition either, just an abrupt color reset after 300ms -
			// this is the same red flash with a real fade added, which is
			// how it was actually remembered/described).
			this.onHardwarePublished = function(data) {
				if (data.modelType === this.getHardwareKey() && data.field === this.model.get('outputMapping')) {
					this.model.set('displayOut', data.value);
					this.lastPublishedAt = Date.now();

					// Toggling a class (not inline color directly) is what
					// makes each flash instant - see Widget.scss's
					// .outvalue.flashRed comment for why a plain
					// .css('color', ...) call fought its own fade
					// transition and never actually reached red.
					//
					// Inline 'transition: none' is held for the ENTIRE
					// blink+hold phase below, not just relying on
					// .flashRed's own "transition: none" rule - removing
					// that class on a blink-OFF toggle would otherwise
					// fall back to .outvalue's base 0.8s transition (no
					// override in effect at that moment), so each blink
					// was a barely-visible partial fade interrupted 90ms
					// later by the next toggle, not a clean flash. Only
					// replaced with a real duration at the very end, when
					// the actual fade-out starts. Found 2026-09-29 - the
					// multi-blink version's very first attempt looked like
					// a static, barely-changing red instead of blinking.
					var self = this;
					var $outvalue = this.$('.outvalue');
					$outvalue.css('transition', 'none');
					clearTimeout(this.publishFlashTimeout);
					clearInterval(this.publishBlinkInterval);

					// Blink a few times before settling, to actually draw
					// the eye - a single flash was easy to miss, explicit
					// request 2026-09-29. blinkToggles counts DOWN on
					// every toggle (on AND off both count), so an odd
					// starting count always ends on an "off" toggle right
					// before the explicit addClass below forces it back on
					// for the hold+fade - the exact parity doesn't matter
					// because that final addClass is unconditional, not
					// relying on where the toggling happened to land.
					var blinkToggles = 5;
					$outvalue.addClass('flashRed');
					this.publishBlinkInterval = setInterval(function() {
						blinkToggles--;
						$outvalue.toggleClass('flashRed');
						if (blinkToggles <= 0) {
							clearInterval(self.publishBlinkInterval);
							$outvalue.addClass('flashRed');
							self.publishFlashTimeout = setTimeout(function() {
								// Fade duration tracks the countdown to the
								// next send (clamped to a sane range)
								// instead of a fixed short duration - found
								// via Phil's own feedback 2026-09-29 that a
								// fixed fade finished well before the
								// actual countdown did, making the flash
								// feel disconnected from the timer it's
								// supposed to reflect. Set as an inline
								// style HERE (removing the class, not
								// adding it) - it has to happen at this
								// exact point, not when .flashRed was
								// added, or it would override that class's
								// own "transition: none" and slow down the
								// flash-TO-red too (the same bug this whole
								// toggled-class approach was built to avoid).
								var sendInterval = parseInt(self.model.get('sendInterval'), 10) || 0;
								var fadeSeconds = Math.min(Math.max((sendInterval - 200) / 1000, 0.3), 4);
								$outvalue.css('transition', 'color ' + fadeSeconds + 's ease-out').removeClass('flashRed');
							}, 200);
						}
					}, 90);
				}
			}.bind(this);
			window.app.vent.on('hardwarePublished', this.onHardwarePublished);
		},
		onRemove: function() {
			window.app.vent.off('hardwareStatus', this.onHardwareStatus);
			window.app.vent.off('hardwarePublished', this.onHardwarePublished);
			clearTimeout(this.publishFlashTimeout);
			clearInterval(this.publishBlinkInterval);
			window.app.timingController.removeFrameCallback(this.localSendCountdownFunc, this);
		},
		// Recomputes sendCountdownText from lastPublishedAt/sendInterval -
		// called every frame (registerFrameCallback above), but only
		// actually touches the model (and so the DOM, via rivets)
		// when the rounded-to-a-tenth-of-a-second text would actually
		// change, same "don't thrash the DOM every frame for a value
		// that only needs ~10 updates/sec" reasoning the pre-rewrite
		// version's own 100ms-gated timeKeeper had.
		updateSendCountdown: function() {
			var sendInterval = parseInt(this.model.get('sendInterval'), 10) || 0;
			var text = '';

			var counting = false;

			if (this.model.get('activeOut') && sendInterval > 0) {
				var remaining = sendInterval - (Date.now() - this.lastPublishedAt);
				text = 'send in ' + (Math.max(remaining, 0) / 1000).toFixed(1) + 's';
				counting = remaining > 0;
			}

			if (this.model.get('sendCountdownText') !== text) {
				this.model.set('sendCountdownText', text);
			}

			// Red for as long as the countdown is running; back to grey
			// once the next send is allowed. (First tried as "red only
			// while a changed value is actually waiting" - but the first
			// change after a quiet spell is published at once, so the
			// countdown that follows it never turned red at all.)
			if (this.model.get('sendPending') !== counting) {
				this.model.set('sendPending', counting);
			}
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
		// See utils/cloudStatus.js - what the connection indicator shows.
		updateCloudStatus: function() {
			this.model.set(cloudStatus.describe(this.model.get('activeOut') === true, this.model.get('cloudConnected'), this.lastCloudError, this.lastTopicError));
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
				// Set when the user switches the widget on (see
				// onModelChange) and sent once: tells CloudModel.js this
				// is a deliberate connect, as opposed to the routine
				// re-send this function also does on every value change.
				// Only a deliberate one may replace a connection that's
				// already up with different credentials, or retry a
				// login the broker has already refused.
				forceReconnect: this.explicitConnect === true,
			});
			this.explicitConnect = false;

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
			// A topic error describes the settings it happened under -
			// see utils/cloudStatus.js's topicErrorFor.
			if (changed && (changed.topic !== undefined || changed.host !== undefined || changed.port !== undefined
				|| changed.username !== undefined || changed.password !== undefined || changed.tls !== undefined
				|| changed.activeOut === false)) {
				this.lastTopicError = null;
			}
			if (changed && (changed.activeOut !== undefined || changed.cloudConnected !== undefined || changed.topic !== undefined)) {
				this.updateCloudStatus();
			}

			if(changed) {
				// A username/password/TLS edit is the same kind of change
				// as host/port below - what's connected no longer matches
				// what the widget says - so it turns the widget off the
				// same way, and the next enable reconnects with the new
				// values (see enableDevice's forceReconnect). Found
				// 2026-10-03: editing the credentials of a connected
				// CloudOut did nothing at all - it stayed "Connected" on
				// the old login. The previous attempt's error no longer
				// describes the new settings either.
				if(changed.username !== undefined || changed.password !== undefined || changed.tls !== undefined) {
					this.lastCloudError = null;
					// The last status described the old login - without
					// this, switching back on shows "Connected" for a
					// moment before the server has answered at all.
					this.lastStatusInfo = null;
					this.model.set('activeOut', false);
				}
				if(changed.host !== undefined || changed.port !== undefined) {
					this.lastCloudError = null;
				}
				// A topic edit switches the widget off too, like every
				// other connection setting (2026-10-06) - nothing gets
				// published to a topic that's still being changed.
				if(changed.topic !== undefined) {
					this.model.set('activeOut', false);
				}


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

					this.explicitConnect = (changed.activeOut === true);
					this.enableDevice();
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
        },

	});
});
