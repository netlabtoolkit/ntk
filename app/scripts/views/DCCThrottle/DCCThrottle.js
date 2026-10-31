define([
	'backbone',
	'rivets',
	'views/item/WidgetMulti',
	'text!./template.js',
	'jqueryknob',
	'utils/DccLoco',
],
function(Backbone, rivets, WidgetView, Template, jqueryknob, DccLoco){
	'use strict';

	// One loco's speed and direction on a DCC command station, over
	// WiThrottle (see plans/dcc-ex-widgets.md and server/modules/
	// nlHardware/WiThrottleModel.js, which holds the session). Its
	// functions (lights, sounds) are DCC Function widgets. The station is
	// the truth: when someone else's throttle changes this loco, the dial
	// and direction follow it.

	var MAX_SPEED = 126;
	// A speed this widget sent coming back within this long is its own
	// echo, not someone else's change - see onLocoReport.
	var OWN_ECHO_MS = 1500;

	function toNumber(value, fallback) {
		var n = parseFloat(value);
		return isNaN(n) ? fallback : n;
	}

	return WidgetView.extend(_.extend({}, DccLoco, {
		widgetEvents: {
			'click .dccDirection': 'directionClicked',
			'click .dccStop': 'stopClicked',
			'click .dccStatus': 'dccStatusClicked',
		},
		ins: [
			// 0-126, or whatever the more panel's range says.
			{title: 'speed', to: 'inSpeed'},
			// Adds to the current speed - for an Encoder's step outlet.
			{title: 'step', to: 'inStep'},
			{title: 'direction (forward when high)', to: 'inDirection'},
			{title: 'stop (emergency stop on rising)', to: 'inStop'},
		],
		outs: [
			{title: 'speed', from: 'speed', to: 'speed'},
			{title: 'direction (1 forward, 0 reverse)', from: 'direction', to: 'direction'},
			{title: 'address', from: 'address', to: 'address'},
		],
		typeID: 'DCCThrottle',
		// See DccLoco.releaseLoco.
		stopOnRelease: true,
		className: 'dccThrottle dccWidget',
		categories: ['network'],
		template: _.template(Template),

		initialize: function(options) {
			WidgetView.prototype.initialize.call(this, options);

			// Read by onModelChange, which the set() calls below fire -
			// must exist first (see CLAUDE.md's Rivets/Backbone gotchas).
			this.speedExact = 0;
			this.recentSent = [];
			this.lastStop = undefined;
			this.lastStep = 0;
			this.initDcc();

			var get = this.model.get.bind(this.model);
			this.model.set({
				title: 'DCC Throt',
				inMin: get('inMin') === undefined ? 0 : get('inMin'),
				inMax: get('inMax') === undefined ? MAX_SPEED : get('inMax'),
				// Inlets - '--' until something arrives through a cable.
				inSpeed: '--', inStep: '--', inDirection: '--', inStop: '--',
				// Outlets, as the station reports them.
				speed: 0,
				direction: 1,
				address: parseInt(get('loco'), 10) || 0,
				// Display only.
				reverse: false,
			});
		},

		onRender: function() {
			var self = this;

			// Must be registered before WidgetView.prototype.onRender -
			// see CLAUDE.md's Rivets/Backbone gotcha.
			this.dccRegisterFormatters(rivets);
			rivets.binders.dccknob = function(el, value) {
				$(el).val(value).trigger('change');
			};

			WidgetView.prototype.onRender.call(this);

			// Dragging the dial stands in for a hardware knob, so a patch
			// can be tried with nothing wired in.
			this.$('.dial').knob({
				'fgColor': '#000000',
				'bgColor': '#ffffff',
				'inputColor': '#000000',
				'angleOffset': -125,
				'angleArc': 250,
				'width': 80,
				'height': 62,
				'displayInput': false,
				'min': 0,
				'max': MAX_SPEED,
				'change': function(v) {
					v = parseFloat(v);
					if(!isNaN(v)) { self.setSpeed(v); }
				},
			});

			// One speed step per wheel click, like an encoder's detents -
			// jquery-knob's own wheel handler never calls 'change'.
			this.$('.dialwrapper canvas, .dial').unbind('mousewheel DOMMouseScroll');
			this.$('.dialwrapper').on('wheel', function(e) {
				e.preventDefault();
				var deltaY = e.originalEvent.deltaY;
				var now = Date.now();
				if(!deltaY || now - (self.lastWheelMs || 0) < 25) { return; }
				self.lastWheelMs = now;
				self.setSpeed(self.speedExact + (deltaY > 0 ? -1 : 1));
			});
		},

		onRemove: function() {
			this.removeDcc();
		},

		/**
		 * setSpeed - the one place this widget's own speed changes, from
		 * the dial, the wheel and the speed / step inlets. The speed is
		 * kept as a decimal so a fractional step (0.5) gives finer
		 * control; the station only takes whole steps, so the rounded
		 * speed is what's shown, sent and output.
		 *
		 * @param {number} value
		 * @return {void}
		 */
		setSpeed: function(value) {
			this.speedExact = Math.max(0, Math.min(MAX_SPEED, value));
			var rounded = Math.round(this.speedExact);
			if(rounded === this.model.get('speed')) { return; }
			this.recentSent.push({value: rounded, at: Date.now()});
			this.model.set('speed', rounded);
			this.sendToLoco('speed', rounded);
		},

		setDirection: function(forward) {
			var direction = forward ? 1 : 0;
			if(direction === this.model.get('direction')) { return; }
			this.model.set({direction: direction, reverse: !forward});
			this.sendToLoco('direction', direction);
		},

		emergencyStop: function() {
			this.speedExact = 0;
			this.recentSent.push({value: 0, at: Date.now()});
			this.model.set('speed', 0);
			this.sendToLoco('stop', 1);
		},

		directionClicked: function(e) {
			e.preventDefault();
			this.setDirection(this.model.get('direction') !== 1);
		},

		stopClicked: function(e) {
			e.preventDefault();
			this.emergencyStop();
		},

		onLocoReport: function(what, value) {
			if(what === 'speed') {
				// This widget's own speed coming back (possibly an older
				// one, from a fast drag) only confirms it. Anything else
				// is someone else's throttle: follow it, dropping any
				// fraction, so the next step starts from the real speed.
				var now = Date.now();
				this.recentSent = _.filter(this.recentSent, function(s) { return now - s.at < OWN_ECHO_MS; });
				if(_.findWhere(this.recentSent, {value: value})) { return; }
				this.speedExact = value;
				this.model.set('speed', value);
			}
			else if(what === 'direction') {
				this.model.set({direction: value, reverse: value !== 1});
			}
		},

		onModelChange: function(model, options) {
			var changed = model.changedAttributes();
			if(!changed) { return; }

			if(this.dccSettingsChanged(changed)) {
				this.model.set('address', parseInt(this.model.get('loco'), 10) || 0);
				this.speedExact = 0;
			}

			// Inlets only mean something when they arrive through a cable
			// (WidgetMulti.syncWithSource marks those with updateNoTrigger),
			// not when a patch loads them.
			if(!(options && options.updateNoTrigger)) { return; }

			if(changed.inSpeed !== undefined) {
				var v = toNumber(changed.inSpeed, NaN);
				var inMin = toNumber(this.model.get('inMin'), 0), inMax = toNumber(this.model.get('inMax'), MAX_SPEED);
				if(!isNaN(v) && inMax !== inMin) {
					this.setSpeed((v - inMin) / (inMax - inMin) * MAX_SPEED);
				}
			}
			if(changed.inStep !== undefined) {
				// Only a new value is a step. Setting speed below makes
				// Backbone fire 'change' again with inStep still listed as
				// changed, so without this one +1 kept adding itself until
				// the speed hit 126. An Encoder's step outlet goes back to
				// 0 after each turn, so two turns the same way still count.
				var step = toNumber(changed.inStep, 0), lastStep = this.lastStep;
				this.lastStep = step;
				if(step && step !== lastStep) { this.setSpeed(this.speedExact + step); }
			}
			if(changed.inDirection !== undefined) {
				var d = toNumber(changed.inDirection, NaN);
				if(!isNaN(d)) { this.setDirection(d > 0.5); }
			}
			if(changed.inStop !== undefined) {
				var stop = toNumber(changed.inStop, 0), last = this.lastStop;
				this.lastStop = stop;
				if(stop > 0.5 && !(last > 0.5)) { this.emergencyStop(); }
			}
		},

		setFromModel: function(model) {
			this.dccSetFromModel(model);
			this.model.set({address: parseInt(this.model.get('loco'), 10) || 0, reverse: this.model.get('direction') !== 1});
			this.speedExact = toNumber(this.model.get('speed'), 0);
			return this;
		},
	}));
});
