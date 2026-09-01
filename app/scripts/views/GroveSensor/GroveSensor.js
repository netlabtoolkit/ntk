define([
	'backbone',
	'rivets',
	'utils/SignalChainFunctions',
	'utils/SignalChainClasses',
	'views/item/WidgetMulti',
	'views/WidgetSettings',
	'text!./template.js',
	'./sensorCatalog',
],
function(Backbone, rivets, SignalChainFunctions, SignalChainClasses, WidgetView, WidgetSettingsView, Template, sensorCatalog){
	'use strict';

	return WidgetView.extend({
		widgetEvents: {
			'change .sensorSelect': 'sensorChanged',
			'click .invert': 'toggleInvert',
			'click .smoothing': 'toggleSmoothing',
			'click .easing': 'toggleEasing',
			'change .smoothingAmount': 'smoothingAmtChange',
			'change .pinInput': 'pinChanged',
		},
		ins: [],
		outs: [
			// Rebuilt per-sensor by remapSensor() - this default only
			// matters for the very first render, before remapSensor()
			// runs once from initialize().
		],
		typeID: 'GroveSensor',
		deviceMode: 'INPUT',
		className: 'groveSensor',
		categories: ['I/O'],
		template: _.template(Template),
		sensorCatalog: sensorCatalog,

		initialize: function(options) {
			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);

			var firstSensorId = this.model.get('sensor') || Object.keys(this.sensorCatalog)[0];
			var firstSensorEntry = this.sensorCatalog[firstSensorId];

			// Must exist BEFORE the model.set() below - that set() fires
			// 'change' synchronously, which WidgetMulti's base initialize()
			// (already called above) has bound directly to
			// processSignalChain, and processSignalChain reads
			// this.axisStates via getAxisState(). Same gotcha CLAUDE.md
			// documents for onModelChange: internal state a change-time
			// callback reads must be set up before the triggering .set(),
			// not after, or construction throws.
			this.axisStates = {};

			this.model.set({
				// Kept short (matching AnalogIn/DigitalIn's length) so it
				// fits the fixed-width widgetTop title bar next to the
				// remove (x) button - 'GroveSensor' is long enough to wrap
				// the title text onto a second line, pushing the remove
				// button out of the visible title bar entirely.
				title: 'GroveIn',
				sensor: firstSensorId,
				active: false,
				sensorStatus: 'idle',
				easing: false,
				easingAmount: 30,
				smoothingAmount: 60,
				// deviceType/server/port are deliberately NOT defaulted
				// here, matching AnalogIn - getDeviceModelType()/
				// getDeviceServerName()/getDeviceServerPort() below supply
				// fallbacks (ArduinoUno/'auto'/3030) when unset, and
				// Patcher.js's applyDefaultDeviceToModel() stamps the left
				// panel's Settings > Device default onto this model right
				// after creation when that default is Network. A Grove
				// sensor reading only actually arrives over this custom
				// sysex extension's CircuitPython WiFi firmware, but the
				// widget still offers the same Serial/Network choice as
				// every other hardware widget for consistency - pointed at
				// a serial device that doesn't implement this extension,
				// it just sits at "waiting" instead of erroring.
				// Raw sensor readings (e.g. accelerometer m/s^2) aren't in
				// NTK's usual 0-1023 convention and can go negative - scaled
				// through the same SignalChainFunctions.scale mechanism
				// AnalogIn uses (pushed onto signalChainFunctions below).
				// inputFloor/inputCeiling are seeded from the selected
				// sensor's catalog range (see remapSensor()) since that's a
				// property of the sensor, not something the user should
				// have to look up. outputFloor/outputCeiling default to
				// NTK's normal 0-1023 convention, UNLESS the catalog entry
				// declares its own outputRange (e.g. DHT11's, which
				// matches its input range 1:1 so readings show real
				// temperature/humidity numbers instead of the 0-1023
				// convention) - either way, still user-adjustable in the
				// "more" panel afterward like every other scaled widget.
				inputFloor: firstSensorEntry.range.floor,
				inputCeiling: firstSensorEntry.range.ceiling,
				outputFloor: this.model.get('outputFloor') === undefined ? (firstSensorEntry.outputRange || {floor: 0}).floor : this.model.get('outputFloor'),
				outputCeiling: this.model.get('outputCeiling') === undefined ? (firstSensorEntry.outputRange || {ceiling: 1023}).ceiling : this.model.get('outputCeiling'),
				// Just the outlet shape for this very first render - the
				// actual hardware mapping + subscribe happens afterward,
				// once this widget is on the canvas (Patcher.js's creation
				// branch calls remapSensor() there, the same place other
				// hardware widgets' initial mapToModel call happens -
				// remapSensor() ends in a render(), which would fire
				// before this view is even attached to the DOM if called
				// from here instead). from is the raw hardware-mapped
				// field, to is the public, scaled outlet - same split as
				// AnalogIn's {from: 'in', to: 'out'}.
				outs: _.map(firstSensorEntry.readings, function(reading) {
					return {title: reading.label, from: reading.key + '_raw', to: reading.key};
				}),
				// Shown under the sensor dropdown (template.js) - the
				// specific chip, not the generic catalog label (e.g.
				// "LIS3DHTR", not "Accelerometer") - see sensorCatalog.js.
				deviceId: this.getDeviceIdLabel(firstSensorEntry),
				// Most sensors are on the shared I2C bus and need no pin
				// info from the widget at all - needsPin (from the
				// catalog) shows a pin field in the "more" panel only for
				// sensors that do (e.g. a single-wire digital DHT11 -
				// there's no bus to find it on, so the widget has to say
				// which GPIO it's wired to). See remapSensor()/
				// subscribeSensor() and template.js's pinField.
				needsPin: !!firstSensorEntry.needsPin,
			});

			// AnalogIn's scale/invert/smoothing/easing chain assumes a
			// single in->out pair, keeping one Smoother instance and one
			// pair of easingNew/easingLast fields on the view itself. This
			// widget drives 3 independent signals (x/y/z) through the same
			// controls, so each needs its OWN smoother and easing state -
			// tracked in this.axisStates (initialized above), keyed by the
			// outlet's public field name (e.g. 'x'), lazily created by
			// getAxisState(). processSignalChain (overridden below) applies
			// scale/invert/easing/smoothing per axis directly, instead of
			// going through the shared this.signalChainFunctions array
			// AnalogIn uses (which has no way to keep 3 independent
			// smoothers straight).
			this.localProcessSignalChain = function() {
				this.processSignalChain();
			}.bind(this);
			window.app.timingController.registerFrameCallback(this.localProcessSignalChain, this);

			this.localTimeKeeperFunc = function(frameCount) {
				this.timeKeeper(frameCount);
			}.bind(this);
			window.app.timingController.registerFrameCallback(this.localTimeKeeperFunc, this);
		},

		/**
		 * getAxisState - lazily create the per-axis smoothing/easing state
		 * for one outlet field (e.g. 'x'). Kept separate per axis since
		 * this widget can report several readings (x/y/z) at once through
		 * one shared set of invert/smoothing/easing controls - see the
		 * comment in initialize().
		 *
		 * @param {string} field the outlet's public (to) field name
		 * @return {object} {smoother, easingNew, easingLast}
		 */
		getAxisState: function(field) {
			if(!this.axisStates[field]) {
				this.axisStates[field] = {
					smoother: new SignalChainClasses.Smoother({
						tolerance: this.model.get('smoothingAmount'),
						active: this.model.get('smoothing'),
					}),
					easingNew: 0,
					easingLast: 0,
				};
			}

			return this.axisStates[field];
		},

		/**
		 * processSignalChain - overrides WidgetMulti's version (which
		 * assumes a single shared this.signalChainFunctions array applied
		 * to every output identically - fine for AnalogIn's one in->out
		 * pair, not enough here since each axis needs its own smoothing/
		 * easing state). Runs scale -> invert -> easing -> smoothing per
		 * axis, same processing AnalogIn does, then writes the result to
		 * the outlet's public field.
		 *
		 * @return {void}
		 */
		processSignalChain: function() {
			var outputs = this.model.get('outs');

			if(!outputs) { return; }

			_.each(outputs, function(output) {
				var state = this.getAxisState(output.to);
				var value = this.model.get(output.from);

				// clampOutput=true - a raw hardware sensor reading landing
				// outside its configured range (e.g. a ToF sensor's "no
				// target" sentinel, an accelerometer spike) should pin to
				// the output extreme, not extrapolate past it and spike
				// whatever's wired downstream. See SignalChainFunctions.js's
				// scale() comment for why this isn't the default everywhere.
				value = SignalChainFunctions.scale(value, this.model.attributes, true);
				value = SignalChainFunctions.invert(value, this.model.attributes);

				state.easingNew = value;
				if(this.model.get('easing')) {
					if(isNaN(state.easingLast)) { state.easingLast = state.easingNew; }
					value = state.easingLast;
				}

				value = state.smoother.smoothInput(value);

				this.model.set(output.to, value);
			}, this);
		},

		/**
		 * timeKeeper - runs every frame (registered in initialize()),
		 * easing each axis's state.easingLast toward its state.easingNew
		 * target. Same easeOutExpo tween AnalogIn's timeKeeper uses, just
		 * looped over every tracked axis instead of one pair of fields.
		 *
		 * @param {number} frameCount
		 * @return {void}
		 */
		timeKeeper: function(frameCount) {
			_.each(this.axisStates, function(state) {
				if(this.model.get('easing')) {
					state.easingLast = this.easeOutExpo(0.17, state.easingLast, (state.easingNew - state.easingLast), this.model.get('easingAmount'));
					if(Math.abs(state.easingLast - state.easingNew) < 0.4) { state.easingLast = state.easingNew; }
					if(isNaN(state.easingLast)) { state.easingLast = state.easingNew; }
				}
				else {
					state.easingLast = state.easingNew;
				}
			}, this);
		},

		easeOutExpo: function(t, b, c, d) {
			return c * (-Math.pow(2, -10 * t/d) + 1) + b;
		},

		toggleInvert: function(e) {
			e.preventDefault();
			e.stopPropagation();
			this.model.set('invert', !this.model.get('invert'));
		},

		/**
		 * toggleSmoothing - toggle on/off signal smoothing for every axis
		 * at once (one shared control, same as AnalogIn's single toggle).
		 *
		 * @return {void}
		 */
		toggleSmoothing: function(e) {
			e.preventDefault();
			e.stopPropagation();

			var newState = !this.model.get('smoothing');
			_.each(this.axisStates, function(state) {
				state.smoother.active = newState;
			});
			this.model.set('smoothing', newState);
		},

		toggleEasing: function(e) {
			e.preventDefault();
			e.stopPropagation();
			this.model.set('easing', !this.model.get('easing'));
		},

		smoothingAmtChange: function(e) {
			var amount = this.model.get('smoothingAmount');
			_.each(this.axisStates, function(state) {
				state.smoother.setBufferLength(amount);
			});
		},

		onRender: function() {
			// Must be registered before WidgetView.prototype.onRender below -
			// see CLAUDE.md's Rivets/Backbone gotcha. Drives the status dot
			// declaratively (see template.js) rather than imperative
			// this.$(...).css(...) calls, per CLAUDE.md's stated preference.
			rivets.formatters.isGroveStatus = function(value, expected) {
				return value === expected;
			};

			// Comma-joined outlet labels (e.g. "X, Y, Z" or "Temp,
			// Humidity"), shown under the status readout (template.js) so
			// it's clear which outlet nub (top to bottom) is which
			// reading without needing to hover each one for its tooltip.
			// Derived straight from widget:outs rather than a separate
			// model field, since outs already has exactly this
			// information and stays in sync automatically.
			rivets.formatters.outletTitles = function(outs) {
				return _.pluck(outs || [], 'title').join(', ');
			};

			// Shared with every other hardware widget's Device dropdown
			// (AnalogIn etc.) - re-registered here too since GroveSensor
			// may be the only hardware widget on the canvas, in which case
			// nothing else would have defined it yet.
			if(!app.server) {
				rivets.formatters.isNetworkDeviceType = function(deviceType) {
					return deviceType === 'network';
				};
			}

			WidgetView.prototype.onRender.call(this);

			this.populateSensorSelect();
		},

		/**
		 * getDeviceIdLabel - the text shown under the sensor dropdown:
		 * the catalog entry's deviceId (e.g. "LIS3DHTR"), with "
		 * (untested)" appended for a sensor not yet confirmed against
		 * real hardware. Previously this suffix was on the dropdown
		 * option itself; moved here so it sits next to the specific chip
		 * instead of the generic sensor kind.
		 *
		 * @param {object} catalogEntry
		 * @return {string}
		 */
		getDeviceIdLabel: function(catalogEntry) {
			return catalogEntry.deviceId + (catalogEntry.tested ? '' : ' (untested)');
		},

		/**
		 * populateSensorSelect - fill the sensor <select> from the shared
		 * catalog. Not data-bound via rv-each (rivets' <option> support
		 * for a plain id->object map is awkward) - built once here instead,
		 * same as how AnalogIn/DigitalIn populate their serial port <select>
		 * imperatively rather than declaratively.
		 *
		 * @return {void}
		 */
		populateSensorSelect: function() {
			var $select = this.$('.sensorSelect'),
				currentSensorId = this.model.get('sensor');

			$select.empty();

			_.each(this.sensorCatalog, function(entry, sensorId) {
				// "(untested)" now shows next to the device ID line
				// instead (see initialize()/remapSensor()'s deviceId
				// assignment) - the dropdown itself just shows the plain
				// sensor label.
				$select.append('<option value="' + sensorId + '">' + entry.label + '</option>');
			});

			$select.val(currentSensorId);
		},

		sensorChanged: function(e) {
			this.remapSensor(this.$('.sensorSelect').val());
		},

		/**
		 * pinChanged - the "more" panel's pin field (only shown/relevant
		 * for a "needsPin" sensor, e.g. DHT11) changed - re-subscribe so
		 * the new pin actually takes effect, instead of waiting for some
		 * other trigger (sensor switch, reconnect) to happen to pick it up.
		 *
		 * @return {void}
		 */
		pinChanged: function(e) {
			this.subscribeSensor(this.model.get('sensor'));
		},

		/**
		 * remapSensor - switch this widget over to a different catalog
		 * entry: tear down whatever hardware mappings it currently has,
		 * rebuild the outlets to match the new sensor's readings, and
		 * (re-)subscribe on the device.
		 *
		 * @param {string} sensorId key into sensorCatalog
		 * @return {void}
		 */
		remapSensor: function(sensorId) {
			var catalogEntry = this.sensorCatalog[sensorId];

			if(!catalogEntry) { return; }

			// remapSensor() is also called (with the sensor UNCHANGED) when
			// restoring a saved patch and when re-establishing mappings
			// after a reconnect - only a genuine switch to a *different*
			// sensor should stomp inputFloor/inputCeiling back to that
			// sensor's catalog range, otherwise a user's saved/adjusted
			// scale settings would be silently reset every time the patch
			// reloads or the device reconnects.
			var isActualSensorSwitch = this.model.get('sensor') !== sensorId;

			this.model.set('sensor', sensorId);
			this.unMapAllHardwareInlets();

			var newAttrs = {
				outs: _.map(catalogEntry.readings, function(reading) {
					return {title: reading.label, from: reading.key + '_raw', to: reading.key};
				}),
				// Shown under the sensor dropdown (template.js) - see
				// sensorCatalog.js/initialize()'s identical comment.
				deviceId: this.getDeviceIdLabel(catalogEntry),
				// See initialize()'s identical comment.
				needsPin: !!catalogEntry.needsPin,
			};

			// inputFloor/inputCeiling are a property of the sensor itself
			// (e.g. an accelerometer's +/-2g range in m/s^2), so these are
			// only re-seeded from the catalog on an actual sensor switch -
			// same for outputFloor/outputCeiling when the catalog entry
			// declares its own outputRange (e.g. DHT11's 1:1 passthrough).
			// A sensor with no outputRange falls back to NTK's normal
			// 0-1023 convention here too, same as switching serial ports
			// doesn't reset AnalogIn's output range - this only fires on
			// an actual switch, so a user's own adjustment in the "more"
			// panel still survives a reconnect/patch reload either way.
			if(isActualSensorSwitch) {
				newAttrs.inputFloor = catalogEntry.range.floor;
				newAttrs.inputCeiling = catalogEntry.range.ceiling;
				newAttrs.outputFloor = (catalogEntry.outputRange || {floor: 0}).floor;
				newAttrs.outputCeiling = (catalogEntry.outputRange || {ceiling: 1023}).ceiling;

				// Per-axis smoother/easing state is tied to whichever
				// physical sensor was previously selected - drop it on an
				// actual switch so a new sensor doesn't inherit smoothing
				// history from a different signal. Re-created lazily by
				// getAxisState() as readings come in.
				this.axisStates = {};
			}

			this.model.set(newAttrs);

			// WidgetMulti.syncWithSource only applies an incoming value if
			// the widget model ALREADY has the destination field defined
			// (`thisWidgetModel.attributes[mapping.destinationField] !==
			// undefined`) - without seeding each reading's raw field here,
			// every received reading is silently skipped and the widget
			// sits on "waiting" forever even though data is flowing.
			_.each(catalogEntry.readings, function(reading) {
				if(this.model.get(reading.key + '_raw') === undefined) {
					this.model.set(reading.key + '_raw', 0);
				}
			}, this);

			var server = this.getDeviceServerName() + ":" + this.getDeviceServerPort();

			_.each(catalogEntry.readings, function(reading, index) {
				app.Patcher.Controller.mapToModel({
					view: this,
					modelType: this.getDeviceModelType(),
					IOMapping: {sourceField: 'grove-' + sensorId + '-' + index, destinationField: reading.key + '_raw'},
					server: server,
				}, true);
			}, this);

			// mapToModel() above already re-renders the view once per
			// call (reflecting the outs/mappings already set above by
			// the time the last one runs) - no need to render again here.
			this.subscribeSensor(sensorId);
		},

		/**
		 * unMapAllHardwareInlets - like AnalogIn's unMapHardwareInlet, but
		 * for every current source, not just sources[0] - a GroveSensor
		 * widget can have one mapping per reading (3 for the accelerometer).
		 *
		 * @return {void}
		 */
		unMapAllHardwareInlets: function() {
			var sourcesToRemove = this.sources;
			this.sources = [];

			_.each(sourcesToRemove, function(source) {
				window.app.vent.trigger('Widget:removeMapping', source, this.model.get('wid'));
			}, this);
		},

		/**
		 * subscribeSensor - tell the server (and from there, the device)
		 * to start reporting this sensor's readings. Unlike a normal pin,
		 * a Grove sensor id isn't something addDefaultPins() already knows
		 * about, so this always goes through the explicit
		 * Widget:hardwareSwitch path (mirrors DigitalIn's switchToInputMode
		 * this session, including the same "sources[0] not populated yet"
		 * guard - mapToModel above runs synchronously so it should be, but
		 * cheap to check).
		 *
		 * @param {string} sensorId
		 * @return {void}
		 */
		subscribeSensor: function(sensorId) {
			if(this.sources[0] === undefined) { return; }

			// A "needs_pin" sensor (e.g. DHT11) can't be subscribed to
			// without a pin to read - rather than sending a doomed
			// request and leaving the status stuck on "waiting" forever
			// (the device would reject it, but nothing currently wires
			// that rejection back to this widget's own status field),
			// catch it here so the status honestly reflects what's wrong.
			var catalogEntry = this.sensorCatalog[sensorId];
			if(catalogEntry && catalogEntry.needsPin && !this.model.get('pin')) {
				this.model.set('sensorStatus', 'error');
				return;
			}

			this.model.set('sensorStatus', 'waiting');

			window.app.vent.trigger('Widget:hardwareSwitch', {
				deviceType: this.sources[0].model.get('type') + ":" + this.getDeviceServerName() + ":" + this.getDeviceServerPort(),
				port: sensorId,
				mode: 'GROVE_SENSOR',
				hasInput: true,
				// Only meaningful for a "needsPin" sensor - see
				// StandardFirmataModel.js's setIOMode, which only reads
				// this for GROVE_SENSOR mode and otherwise ignores it.
				pin: this.model.get('pin'),
			});
		},

		onModelChange: function(model) {
			var changed = model.changedAttributes();

			if(changed) {
				if(changed.server || changed.port) {
					this.model.set('active', false);
				}

				if(changed.deviceType) {
					this.model.set({deviceType: changed.deviceType, active: false});
					// Network vs. serial field visibility is handled
					// declaratively in the template (rv-class-networkmode),
					// so it's correct on every render regardless of
					// whether this 'change' handler happens to fire. No
					// serial port list to request here - unlike AnalogIn
					// etc., GroveSensor's serial mode shows a fixed
					// "doesn't support serial" message instead of a real
					// port picker (see template.js's .serialPortPicker).

					// 'server'/'port' are only ever seeded from the left
					// panel's Device default once, at widget creation (see
					// Patcher.js's applyDefaultDeviceToModel) - manually
					// switching an already-placed widget's dropdown to
					// Network afterward never goes through that, so
					// 'server' can still be completely unset here. Left
					// unset, the ip field's rv-value binding just shows
					// blank, which reads as the field being missing
					// entirely rather than empty - seed it so switching to
					// Network always shows something.
					if(changed.deviceType === 'network' && !this.model.get('server')) {
						this.model.set('server', '192.168.4.1');
					}
				}

				// A real reading for the currently-selected sensor arrived -
				// flip from "waiting" to "ok" (CLAUDE.md: actively show the
				// user something is working, not just accept silently).
				var currentReadingKeys = _.pluck(this.model.get('outs') || [], 'to');
				if(this.model.get('sensorStatus') === 'waiting' && _.some(currentReadingKeys, function(key) { return changed[key] !== undefined; })) {
					this.model.set('sensorStatus', 'ok');
				}

				var inactiveModels = this.inactiveModelsExist();

				if(inactiveModels && this.model.get('active') == true) {
					this.remapSensor(this.model.get('sensor'));
					this.enableDevice();
				}
			}
		},

		getDeviceModelType: function() { return this.model.get('deviceType') === undefined ? 'ArduinoUno' : this.model.get('deviceType'); },
		getDeviceServerName: function() {
			var server = this.model.get('server');
			if(server !== undefined && server !== true) return server;
			// 192.168.4.1 matches the CircuitPython Firmata firmware's SoftAP
			// mode fixed IP - a reasonable default now that boards can be
			// reached that way with nothing to discover. Note this is the
			// only device with a real Grove sensor implementation right
			// now - pointed at a serial ('auto') device, this widget will
			// just sit at "waiting" since standard Firmata doesn't
			// implement this sysex extension.
			return this.getDeviceModelType() === 'ArduinoUno' ? 'auto' : '192.168.4.1';
		},
		getDeviceServerPort: function() { return this.model.get('port') == undefined ? 3030 : this.model.get('port'); },

		/**
		 * setFromModel - called when loading a saved patch (see
		 * WidgetMulti.setFromModel, which this extends). The base
		 * behavior alone (position + enableDevice()) doesn't restore this
		 * widget's actual sensor subscription - remapSensor() does the
		 * mapping+subscribe work already, so just re-run it with
		 * whichever sensor the saved patch had selected.
		 *
		 * @param {object} model
		 * @return {GroveSensorView} this view
		 */
		setFromModel: function(model) {
			WidgetView.prototype.setFromModel.call(this, model);
			this.remapSensor(this.model.get('sensor'));
			return this;
		},

		inactiveModelsExist: function checkForInactiveModels() {
			var inactiveModels = false;

			if(this.sources.length > 0) {
				for(var i = this.sources.length - 1; i >= 0; i--) {
					if(!this.sources[i].model.active) {
						inactiveModels = true;
					}
				}
			}

			return inactiveModels;
		},

		/**
		 * onRemove - Called when the widget is removed. Used for cleanup.
		 *
		 * @return {void}
		 */
		onRemove: function() {
			window.app.timingController.removeFrameCallback(this.localProcessSignalChain, this);
			window.app.timingController.removeFrameCallback(this.localTimeKeeperFunc, this);
			this.unMapAllHardwareInlets();
		},

		enableDevice: function enableHardware() {
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
