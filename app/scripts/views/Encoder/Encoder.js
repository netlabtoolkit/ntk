define([
	'backbone',
	'rivets',
	'views/item/WidgetMulti',
	'text!./template.js',
	'jqueryknob',
],
function(Backbone, rivets, WidgetView, Template, jqueryknob){
	'use strict';

	// How long an attach may go unanswered before it is sent again -
	// same reasoning and value as GroveSensor's RESUBSCRIBE_AFTER_MS (a
	// one-shot request can land on a connection the server then
	// discards while a patch is loading).
	var REATTACH_AFTER_MS = 6000;

	// The two mappings this widget makes onto its device. Anything else
	// in this.sources is a cable from another widget into the "set"
	// inlet, which the hardware bookkeeping below must leave alone -
	// GroveSensor can treat every source as hardware, this widget can't.
	var HARDWARE_FIELDS = ['in', 'encoderError'];

	// "D1" -> 1. NaN for anything that isn't a plain digital pin name.
	function pinIndex(name) {
		var match = /^D?(\d+)$/i.exec(String(name || '').trim());
		return match ? parseInt(match[1], 10) : NaN;
	}

	function toNumber(value, fallback) {
		var n = parseFloat(value);
		return isNaN(n) ? fallback : n;
	}

	return WidgetView.extend({
		widgetEvents: {
			'click .invert': 'toggleInvert',
			'click .wrap': 'toggleWrap',
			'click .easing': 'toggleEasing',
			'change .pinInput': 'pinChanged',
			'change .pinBInput': 'pinBChanged',
		},
		ins: [
			// Whatever arrives here becomes the current value; turning
			// the encoder then counts up or down from it.
			{title: 'set', to: 'set'},
		],
		outs: [
			{title: 'out', from: 'count', to: 'out'},
		],
		typeID: 'Encoder',
		deviceMode: 'INPUT',
		className: 'encoder',
		categories: ['I/O'],
		template: _.template(Template),

		initialize: function(options) {
			WidgetView.prototype.initialize.call(this, options);

			// Read by onModelChange, which the set() below fires - must
			// exist first (see CLAUDE.md's Rivets/Backbone gotchas).
			this.lastIn = undefined;
			this.edgeAccum = 0;
			this.easingLast = this.model.get('count') || 0;

			this.model.set({
				title: 'Encoder',
				active: false,
				// The XIAO expansion board's "A1/D1" Grove port carries
				// D1 and D2. Pin B follows pin A unless set by hand - see
				// pinChanged().
				pin: this.model.get('pin') || 'D1',
				pinB: this.model.get('pinB') || 'D2',
				// Raw device position (counts since the encoder was
				// attached) and the device's error text, if any - the two
				// hardware-mapped fields. Seeded so WidgetMulti's
				// syncWithSource will write to them (it skips undefined
				// destination fields).
				in: 0,
				encoderError: '',
				set: this.model.get('set') === undefined ? 0 : this.model.get('set'),
				// The running value - saved with the patch, so a reload
				// picks up where it left off.
				count: this.model.get('count') === undefined ? 0 : this.model.get('count'),
				out: this.model.get('count') || 0,
				min: this.model.get('min') === undefined ? 0 : this.model.get('min'),
				max: this.model.get('max') === undefined ? 1023 : this.model.get('max'),
				step: this.model.get('step') === undefined ? 1 : this.model.get('step'),
				// Quadrature edges per detent: 4 on most encoders, 2 on
				// many KY-040 modules.
				edgesPerClick: this.model.get('edgesPerClick') === undefined ? 4 : this.model.get('edgesPerClick'),
				invert: !!this.model.get('invert'),
				wrap: !!this.model.get('wrap'),
				easing: !!this.model.get('easing'),
				easingAmount: this.model.get('easingAmount') === undefined ? 30 : this.model.get('easingAmount'),
				encoderStatus: 'idle',
				statusTitle: 'off',
			});

			this.localProcessSignalChain = function() {
				this.processSignalChain();
			}.bind(this);
			window.app.timingController.registerFrameCallback(this.localProcessSignalChain, this);

			this.localTimeKeeperFunc = function(frameCount) {
				this.timeKeeper(frameCount);
			}.bind(this);
			window.app.timingController.registerFrameCallback(this.localTimeKeeperFunc, this);
		},

		onRender: function() {
			var self = this;

			// Must be registered before WidgetView.prototype.onRender -
			// see CLAUDE.md's Rivets/Backbone gotcha.
			rivets.formatters.isEncoderStatus = function(value, expected) {
				return value === expected;
			};
			if(!app.server) {
				rivets.formatters.isNetworkDeviceType = function(deviceType) {
					return deviceType === 'network';
				};
			}
			rivets.binders.encoderknob = function(el, value) {
				$(el).val(value).trigger('change');
			};

			WidgetView.prototype.onRender.call(this);

			// Dragging (or scrolling over) the dial stands in for turning
			// the real encoder, so a patch can be built and tested with no
			// hardware attached. Mouse-wheel steps by `step`, like detents.
			this.$('.dial').knob({
				'fgColor': '#000000',
				'bgColor': '#ffffff',
				'inputColor': '#000000',
				'angleOffset': -125,
				'angleArc': 250,
				'width': 80,
				'height': 62,
				'displayInput': false,
				'min': this.getMin(),
				'max': this.getMax(),
				'step': this.getStep(),
				'change': function(v) { self.setCount(parseFloat(v)); },
			});

			// jquery-knob's own wheel handler only moves its arc - it never
			// calls the 'change' hook above, so the value didn't follow -
			// and it clamps at min/max, so wrap couldn't be tried with it.
			// Replaced: each wheel event is one encoder click instead.
			this.$('.dialwrapper canvas, .dial').unbind('mousewheel DOMMouseScroll');
			this.$('.dialwrapper').on('wheel', function(e) {
				e.preventDefault();
				var deltaY = e.originalEvent.deltaY;
				// A trackpad sends a stream of small wheel events - one
				// click per 25ms keeps a swipe from racing through the range.
				var now = Date.now();
				if(!deltaY || now - (self.lastWheelMs || 0) < 25) { return; }
				self.lastWheelMs = now;
				var direction = deltaY < 0 ? 1 : -1;
				self.setCount(toNumber(self.model.get('count'), 0) + direction * self.getStep());
			});
		},

		getMin: function() { return toNumber(this.model.get('min'), 0); },
		getMax: function() { return toNumber(this.model.get('max'), 1023); },
		getStep: function() {
			var step = Math.abs(toNumber(this.model.get('step'), 1));
			return step > 0 ? step : 1;
		},

		/**
		 * setCount - the single place the running value changes, from
		 * the encoder, the dial or the "set" inlet. Keeps it within
		 * min/max - wrapping around in wrap mode, otherwise held at the
		 * end, so turning back moves off the limit right away.
		 *
		 * @param {number} value
		 * @return {void}
		 */
		setCount: function(value) {
			if(isNaN(value)) { return; }

			var min = Math.min(this.getMin(), this.getMax()),
				max = Math.max(this.getMin(), this.getMax());

			if(this.model.get('wrap')) {
				// One step past max lands on min (and vice versa), so a
				// 0-1023 range with step 1 is 1024 positions around.
				var span = max - min + this.getStep();
				value = min + (((value - min) % span) + span) % span;
			}
			else {
				value = Math.min(max, Math.max(min, value));
			}

			// Floating-point steps (0.1) shouldn't drift into 0.30000000004.
			value = Math.round(value * 1e6) / 1e6;

			if(value !== this.model.get('count')) {
				this.model.set('count', value);
			}
		},

		/**
		 * onEncoderPosition - a new raw position arrived from the device.
		 * Only the change since the last one matters: the device's own
		 * count restarts at 0 on every attach (new connection, pin
		 * change), and the first reading after that just sets the
		 * baseline, so the value doesn't jump.
		 *
		 * @param {number} position
		 * @return {void}
		 */
		onEncoderPosition: function(position) {
			position = parseInt(position, 10);
			if(isNaN(position)) { return; }

			if(this.model.get('encoderStatus') !== 'ok') {
				this.setStatus('ok');
			}

			if(this.lastIn === undefined) {
				this.lastIn = position;
				return;
			}

			// The device reports raw quadrature edges; group them into
			// clicks. Leftover edges carry over, and a bounce (+1 then -1)
			// cancels out before it ever adds up to a click.
			this.edgeAccum += position - this.lastIn;
			this.lastIn = position;
			var edgesPerClick = this.getEdgesPerClick();
			var clicks = this.edgeAccum < 0 ? Math.ceil(this.edgeAccum / edgesPerClick) : Math.floor(this.edgeAccum / edgesPerClick);
			if(clicks === 0) { return; }
			this.edgeAccum -= clicks * edgesPerClick;

			var direction = this.model.get('invert') ? -1 : 1;
			this.setCount(toNumber(this.model.get('count'), 0) + clicks * this.getStep() * direction);
		},

		getEdgesPerClick: function() {
			var n = parseInt(this.model.get('edgesPerClick'), 10);
			return n >= 1 ? n : 4;
		},

		setStatus: function(status, detail) {
			var titles = {
				idle: 'off',
				waiting: 'connecting...',
				ok: 'connected',
				error: 'error: ' + (detail || 'unknown'),
			};
			this.model.set({encoderStatus: status, statusTitle: titles[status]});
		},

		/**
		 * processSignalChain - out follows count, eased if easing is on.
		 * Skipped while Monitor mode is feeding this widget the board's
		 * own values (same guard as WidgetMulti/GroveSensor).
		 *
		 * @return {void}
		 */
		processSignalChain: function() {
			if (window.app.monitoring && window.app.monitoring.active &&
				window.app.monitoring.wids && window.app.monitoring.wids[this.model.get('wid')]) {
				return;
			}

			var count = toNumber(this.model.get('count'), 0);
			var out = this.model.get('easing') ? this.easingLast : count;

			if(out !== this.model.get('out')) {
				this.model.set('out', out);
			}
		},

		timeKeeper: function(frameCount) {
			var target = toNumber(this.model.get('count'), 0);

			if(this.model.get('easing')) {
				this.easingLast = this.easeOutExpo(0.17, this.easingLast, (target - this.easingLast), toNumber(this.model.get('easingAmount'), 30));
				if(Math.abs(this.easingLast - target) < 0.01 || isNaN(this.easingLast)) {
					this.easingLast = target;
				}
			}
			else {
				this.easingLast = target;
			}
		},

		easeOutExpo: function(t, b, c, d) {
			return c * (-Math.pow(2, -10 * t/d) + 1) + b;
		},

		toggleInvert: function(e) {
			e.preventDefault();
			e.stopPropagation();
			this.model.set('invert', !this.model.get('invert'));
		},

		toggleWrap: function(e) {
			e.preventDefault();
			e.stopPropagation();
			this.model.set('wrap', !this.model.get('wrap'));
		},

		toggleEasing: function(e) {
			e.preventDefault();
			e.stopPropagation();
			this.model.set('easing', !this.model.get('easing'));
		},

		/**
		 * pinChanged - pin A edited. Pin B moves along to the next pin,
		 * since an encoder's two signal pins sit side by side on a Grove
		 * connector (and must be adjacent GPIOs on a Pico). It can still
		 * be edited by hand afterward.
		 */
		pinChanged: function(e) {
			var index = pinIndex(this.model.get('pin'));
			if(!isNaN(index)) {
				this.model.set({pin: 'D' + index, pinB: 'D' + (index + 1)});
			}
			this.remapEncoder();
		},

		pinBChanged: function(e) {
			var index = pinIndex(this.model.get('pinB'));
			if(!isNaN(index)) {
				this.model.set('pinB', 'D' + index);
			}
			this.remapEncoder();
		},

		getHardwareSources: function() {
			return _.filter(this.sources, function(source) {
				return HARDWARE_FIELDS.indexOf(source.map.destinationField) !== -1;
			});
		},

		/**
		 * remapEncoder - (re)create the two hardware mappings for the
		 * current pin A and, if switched on, attach the encoder on the
		 * device. Like GroveSensor's remapSensor: the mappings are made
		 * whether or not the widget is on (inactiveModelsExist() needs
		 * them to notice a reconnect is due), only the attach is gated.
		 *
		 * @return {void}
		 */
		remapEncoder: function() {
			this.unMapHardwareInlets();

			var encNum = pinIndex(this.model.get('pin'));
			if(isNaN(encNum) || isNaN(pinIndex(this.model.get('pinB')))) {
				this.setStatus('error', 'pins must look like D1, D2');
				return;
			}

			var server = this.getDeviceServerName() + ":" + this.getDeviceServerPort();

			app.Patcher.Controller.mapToModel({
				view: this,
				modelType: this.getDeviceModelType(),
				IOMapping: {sourceField: 'enc-' + encNum, destinationField: 'in'},
				server: server,
			}, true);
			app.Patcher.Controller.mapToModel({
				view: this,
				modelType: this.getDeviceModelType(),
				IOMapping: {sourceField: 'enc-' + encNum + '-error', destinationField: 'encoderError'},
				server: server,
			}, true);

			if(this.model.get('active')) {
				this.attachEncoder();
			}
			else {
				this.setStatus('idle');
			}
		},

		unMapHardwareInlets: function() {
			var toRemove = this.getHardwareSources();
			this.sources = _.difference(this.sources, toRemove);

			_.each(toRemove, function(source) {
				this.stopListening(source.model, 'change', this.syncWithSource);
				window.app.vent.trigger('Widget:removeMapping', source, this.model.get('wid'));
			}, this);
		},

		/**
		 * attachEncoder - ask the device to start counting on pin A/B.
		 * Re-sent until a position comes back, same as GroveSensor's
		 * subscribeSensor (a repeat attach is harmless: the firmware
		 * releases the old one first).
		 *
		 * @return {void}
		 */
		attachEncoder: function() {
			var hardwareSource = _.find(this.sources, function(source) {
				return source.map.destinationField === 'in';
			});
			if(!hardwareSource) { return; }

			// The device's count restarts at 0 - take the next reading
			// as the new baseline (see onEncoderPosition).
			this.lastIn = undefined;
			this.edgeAccum = 0;
			// The device's first reply is position 0. If `in` already
			// holds 0, Backbone sees no change and onModelChange never
			// hears the reply - the widget then sits on "waiting" until
			// the knob is turned. Clear it quietly so any reply counts.
			this.model.set('in', null, {silent: true});
			this.setStatus('waiting');

			var self = this;
			var pins = this.model.get('pin') + '/' + this.model.get('pinB');
			clearTimeout(this.reattachTimer);
			this.reattachTimer = setTimeout(function() {
				if(self.removed || self.model.get('active') !== true) { return; }
				if(self.model.get('encoderStatus') !== 'waiting') { return; }
				if(self.model.get('pin') + '/' + self.model.get('pinB') !== pins) { return; }
				self.attachEncoder();
			}, REATTACH_AFTER_MS);

			window.app.vent.trigger('Widget:hardwareSwitch', {
				deviceType: hardwareSource.model.get('type') + ":" + this.getDeviceServerName() + ":" + this.getDeviceServerPort(),
				port: this.model.get('pin'),
				mode: 'ENCODER',
				hasInput: true,
				pinB: this.model.get('pinB'),
			});
		},

		onModelChange: function(model, options) {
			var changed = model.changedAttributes();

			if(!changed) { return; }

			// in/encoderError (the device) and set (a cable into the
			// inlet) only mean something when they really arrived from a
			// source - WidgetMulti.syncWithSource marks those with
			// updateNoTrigger. The same fields also change when this
			// widget seeds its defaults or a saved patch is loaded, and
			// treating that as input would flip the status to
			// "connected" with nothing connected, or replay an old "set"
			// value over the saved count.
			var fromSource = !!(options && options.updateNoTrigger);

			if(changed.server || changed.port) {
				this.model.set('active', false);
			}

			if(changed.deviceType) {
				this.model.set({deviceType: changed.deviceType, active: false});
				// See GroveSensor's identical comment - give a Network
				// device an address to show.
				if(changed.deviceType === 'network' && !this.model.get('server')) {
					this.model.set('server', '192.168.4.1');
				}
			}

			if(changed.active === false) {
				clearTimeout(this.reattachTimer);
				this.setStatus('idle');
			}

			if(fromSource && changed.in !== undefined) {
				this.onEncoderPosition(changed.in);
			}

			if(fromSource && changed.encoderError) {
				clearTimeout(this.reattachTimer);
				this.setStatus('error', changed.encoderError);
			}

			if(fromSource && changed.set !== undefined) {
				this.setCount(toNumber(changed.set, NaN));
			}

			// A new range or wrap setting applies to the current value
			// right away, and the dial's own range/step follow.
			if(changed.min !== undefined || changed.max !== undefined || changed.wrap !== undefined || changed.step !== undefined) {
				this.setCount(toNumber(this.model.get('count'), 0));
				this.$('.dial').trigger('configure', {min: this.getMin(), max: this.getMax(), step: this.getStep()});
			}

			// Switched on, or the device connection behind it needs
			// re-establishing - see GroveSensor's onModelChange for why
			// both cases.
			if((this.inactiveModelsExist() || changed.active === true) && this.model.get('active') == true) {
				this.remapEncoder();
				this.enableDevice();
			}
		},

		inactiveModelsExist: function() {
			return _.some(this.getHardwareSources(), function(source) {
				return !source.model.active;
			});
		},

		getDeviceModelType: function() { return this.model.get('deviceType') === undefined ? 'ArduinoUno' : this.model.get('deviceType'); },
		getDeviceServerName: function() {
			var server = this.model.get('server');
			if(server !== undefined && server !== true) return server;
			return this.getDeviceModelType() === 'ArduinoUno' ? 'auto' : '192.168.4.1';
		},
		getDeviceServerPort: function() { return this.model.get('port') == undefined ? 3030 : this.model.get('port'); },

		/**
		 * setFromModel - loading a saved patch. Re-run the mapping (and
		 * attach, if the widget was saved switched on) with the saved
		 * pins, same as GroveSensor does with its saved sensor.
		 */
		setFromModel: function(model) {
			WidgetView.prototype.setFromModel.call(this, model);
			this.easingLast = toNumber(this.model.get('count'), 0);
			this.remapEncoder();
			return this;
		},

		onRemove: function() {
			this.removed = true;
			clearTimeout(this.reattachTimer);
			window.app.timingController.removeFrameCallback(this.localProcessSignalChain, this);
			window.app.timingController.removeFrameCallback(this.localTimeKeeperFunc, this);
			this.unMapHardwareInlets();
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
