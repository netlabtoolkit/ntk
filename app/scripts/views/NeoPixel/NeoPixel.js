define([
	'backbone',
    'rivets',
	'views/item/WidgetMulti',
	'text!./template.js',
],
function(Backbone, rivets, WidgetView, Template){
	'use strict';

	// speed (0-100 widget scale) -> seconds per full cycle, same
	// mapping as neopixel_output.py's own _speed_to_period_s (kept in
	// sync by eye, not by sharing code across JS/Python - the firmware
	// is what actually drives the strip, this is only the simulated
	// preview's version of the same motion).
	function speedToPeriodS(speed) {
		speed = Math.max(1, Math.min(100, parseInt(speed, 10) || 1));
		return 6.0 - (speed - 1) * (5.7 / 99);
	}

	// Same pure-Python colorwheel() neopixel_output.py falls back to
	// when rainbowio isn't available, ported line-for-line so the
	// browser preview's rainbow mode visually matches the device's.
	function colorwheel(pos) {
		pos = ((pos % 256) + 256) % 256;
		if(pos < 85) { return [255 - pos * 3, pos * 3, 0]; }
		if(pos < 170) { pos -= 85; return [0, 255 - pos * 3, pos * 3]; }
		pos -= 170;
		return [pos * 3, 0, 255 - pos * 3];
	}

	function hexToRgb(hex) {
		var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
		if(!m) { return [255, 0, 0]; }
		return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
	}

	function rgbToHex(rgb) {
		function byteHex(v) { return ('0' + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2); }
		return '#' + byteHex(rgb[0]) + byteHex(rgb[1]) + byteHex(rgb[2]);
	}

	return WidgetView.extend({
		typeID: 'NeoPixel',
		deviceMode: 'OUTPUT',
		categories: ['I/O'],
		className: 'neoPixel',
		template: _.template(Template),
		widgetEvents: {
			'mousedown .serialPortPicker': 'requestSerialPorts',
		},

		// 'in' is the primary inlet - in "vu" mode it's the live meter
		// level (0-1023, NTK's standard inlet range - see
		// neopixel_output.py's _mode_vu); in every OTHER mode it drives
		// brightness instead (see getEffectiveBrightness()), so it's
		// never a dead input just because vu isn't selected. 'color' is
		// a separate named inlet, 'colorHue' (NOT the same model field
		// the color-picker writes) - see getEffectiveColorRgb() for how
		// a wire and the picker coexist without fighting over one
		// field's meaning. numPixels is deliberately NOT
		// wireable (more-panel field only) - dropped 2026-10-01 after
		// a mismatch surfaced between what it was built as ("how many
		// pixels on the strip," wireable so it could be dynamically
		// truncated) and what it was meant to be ("light up one
		// specific pixel"), and on reflection neither was judged worth
		// an inlet of its own.
		ins: [
			{title: 'in (vu level / brightness)', to: 'in'},
			{title: 'speed', to: 'speed'},
			{title: 'color', to: 'colorHue'},
		],
		sources: [],

		initialize: function(options) {
			WidgetView.prototype.initialize.call(this, options);

			this.model.set({
				title: 'NeoPixel',
				activeOut: false,
				// Plain field, deliberately not "outputMapping" - this
				// widget sends one composite NEOPIXEL_REQUEST message
				// (see enableDevice() below), not a generic pin-value
				// write, so it doesn't go through
				// WidgetMulti.js's checkOutputMappingUpdate()/
				// Widget:hardwareSwitch machinery that name would
				// otherwise trigger.
				pin: this.model.get('pin') || 'D7',
				port: this.model.get('port') || 3030,
				numPixels: this.model.get('numPixels') || 8,
				pixelFormat: this.model.get('pixelFormat') || 'RGB',
				mode: this.model.get('mode') || 'full',
				speed: this.model.get('speed') || 50,
				color: this.model.get('color') || '#ff0000',
				brightness: this.model.get('brightness') || 100,
				previewShape: this.model.get('previewShape') || 'strip',
				in: this.model.get('in') || 0,
				// Must exist as a real attribute even though nothing
				// reads its raw value directly (getEffectiveColorRgb()
				// derives from it) - WidgetMulti.js's syncWithSource()
				// only ever writes to a destination field that's
				// already non-undefined on the model, so an inlet
				// wired to a field that was never initialized here is
				// permanently a no-op. Root-caused 2026-10-01: "the
				// color inlet doesn't seem to work" - it never had a
				// chance to, regardless of range or anything else.
				colorHue: this.model.get('colorHue') || 0,
			});
			this.rebuildPixelIndexes();

			// 0.0-1.0, shared by chase/rainbow preview rendering below
			// (mutually exclusive modes, so sharing one accumulator per
			// widget instance is harmless) - see advancePhase()'s own
			// comment.
			this._phase = 0;
			this._phaseLastNow = null;

			// vu mode streams 'in' as fast as whatever's wired into it
			// updates, which could be many times a second - unthrottled,
			// that's a sysexCommand/TCP write per change. Throttled to
			// ~60ms (a smooth-looking meter, not Display text's more
			// conservative 1s floor - see the plan this was built from)
			// via the trailing edge too (not just leading), so the
			// final/settled value is never the one that gets dropped.
			this._throttledEnableDevice = _.throttle(this.enableDevice.bind(this), 60);

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
			if(this._previewFrameCallback) {
				window.app.timingController.removeFrameCallback(this._previewFrameCallback, this);
			}
		},

		onModelChange: function(model) {
			for(var i=this.sources.length-1; i>=0; i--) {
				this.syncWithSource(this.sources[i].model);
			}

			var changed = model.changedAttributes();
			if(!changed) { return; }

			if(changed.server) {
				this.model.set({server: changed.server, activeOut: false});
			}
			if(changed.port) {
				this.model.set({port: changed.port, activeOut: false});
			}
			if(changed.pin) {
				this.model.set({pin: changed.pin, activeOut: false});
			}
			if(changed.deviceType) {
				this.model.set({deviceType: changed.deviceType, activeOut: false});
				if(!app.server && changed.deviceType !== "network") {
					this.requestSerialPorts();
				}
			}

			if(changed.numPixels !== undefined) {
				this.rebuildPixelIndexes();
			}
			if(changed.numPixels !== undefined || changed.previewShape !== undefined) {
				this.layoutPreview();
			}

			// 'in' wire (vu level / brightness, see the `ins` comment
			// above) carries a 0-1023 value - NTK's standard inlet
			// range, matching colorHue/vu-level's own convention - but
			// the more-panel brightness field is 0-100. Keeping
			// `brightness` itself in sync with the wire (converted to
			// the same 0-100 scale) when it's actually driving
			// brightness means the panel field visibly reflects what's
			// happening instead of silently diverging, and buildConfig/
			// renderPreview can just read `brightness` directly with no
			// separate resolver. Reentrant model.set() from inside
			// onModelChange is an established safe pattern already used
			// by AnalogOut/DigitalOut/Display's own identical
			// `activeOut: false` resets above - the EARLIER colorHue
			// bug that made this seem risky was actually just colorHue
			// never being initialized as a model attribute at all (see
			// its own initialize() comment), unrelated to reentrancy.
			if(changed.in !== undefined && this.model.get('mode') !== 'vu' && this.isWired('in')) {
				var inRaw = Math.max(0, Math.min(1023, parseInt(this.model.get('in'), 10) || 0));
				var brightnessPercent = Math.round(inRaw / 1023 * 100);
				if(this.model.get('brightness') !== brightnessPercent) {
					this.model.set('brightness', brightnessPercent);
				}
			}

			// Same reasoning/pattern as the brightness sync above -
			// keeping `color` itself in sync with the colorHue wire
			// (converted to a hex string) when it's actually wired
			// means the color-picker swatch visibly reflects it,
			// instead of silently diverging while buildConfig/
			// renderPreview use the wire value underneath. Found
			// 2026-10-01: "the color picker does not change on input
			// from the 3rd inlet."
			if(changed.colorHue !== undefined && this.isWired('colorHue')) {
				var hue = (parseFloat(this.model.get('colorHue')) || 0) / 1023 * 255;
				var hex = rgbToHex(colorwheel(hue));
				if(this.model.get('color') !== hex) {
					this.model.set('color', hex);
				}
			}

			var inactiveModels = this.inactiveModelsExist();

			// Same "changed.activeOut === true directly captures the
			// user just turned this on" reasoning as DigitalOut.js/
			// AnalogOut.js's own onModelChange (same structural fix,
			// mirrored here).
			if( (inactiveModels || changed.activeOut === true) && this.model.get("activeOut") == true ) {
				var modelType = this.getDeviceModelType();

				this.unMapHardwareInlet();

				var server = this.getDeviceServerName();
				var port = this.getDeviceServerPort();

				// We do NOT pass a "model" attribute - same as
				// DigitalOut/AnalogOut, this is a real hardware pin
				// mapping (for cable rendering/reconnect-detection
				// bookkeeping only; the actual data this widget sends
				// is the composite NEOPIXEL_REQUEST message below, not
				// a generic pin-value write).
				app.Patcher.Controller.mapToModel({
					view: this,
					modelType: modelType,
					IOMapping: {sourceField: "out", destinationField: this.model.get('pin')},
					server: server + ":" + port,
				}, true);

				this.enableDevice();
			}
			else if(this.model.get('activeOut') === true &&
				(changed.pin !== undefined || changed.numPixels !== undefined ||
				 changed.pixelFormat !== undefined || changed.mode !== undefined ||
				 changed.speed !== undefined || changed.color !== undefined ||
				 changed.colorHue !== undefined || changed.brightness !== undefined ||
				 changed.in !== undefined)) {
				// Already connected - push ongoing parameter/vu-level
				// changes too. AnalogOut/DigitalOut get this for free
				// from WidgetMulti.js's checkOutputMappingUpdate (keys
				// off a single 'out' field); NeoPixel has several
				// composed fields instead of one, so that generic
				// mechanism never fires for it - handled directly
				// here instead, same intent as Display.js's identical
				// else-branch. Throttled (see initialize()) since this
				// is the path vu mode's rapid 'in' changes take.
				this._throttledEnableDevice();
			}
		},
		getDeviceModelType: function() {return this.model.get('deviceType') === undefined ? 'ArduinoUno' : this.model.get('deviceType')},
		getDeviceServerName: function() {
			var server = this.model.get('server');
			if(server !== undefined && server !== true) return server;
			return this.getDeviceModelType() === 'ArduinoUno' ? 'auto' : '192.168.4.1';
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
			// Only removes the HARDWARE mapping - same copy-pasted
			// pattern as AnalogOut/DigitalOut's identical method (see
			// their comments for the fuller history). Keeps everything
			// mapped to the real inlets ('in'/'speed'/'colorHue').
			var realInlets = {in: true, speed: true, colorHue: true};
			var kept = [];
			for(var i=0; i<this.sources.length; i++) {
				if(realInlets[this.sources[i].map.destinationField]) {
					kept.push(this.sources[i]);
				}
				else {
					window.app.vent.trigger('Widget:removeMapping', this.sources[i], this.model.get('wid'));
				}
			}
			this.sources = kept;
		},
		// Is anything actually wired into this destination field right
		// now? Used to decide whether a wire's value should override
		// the equivalent more-panel field (colorHue vs the color
		// picker) rather than just reading whatever 'in'/'colorHue'
		// happen to be sitting at (0 when nothing's wired, which would
		// otherwise look identical to a real wired zero).
		isWired: function(destinationField) {
			for(var i=0; i<this.sources.length; i++) {
				if(this.sources[i].map.destinationField === destinationField) { return true; }
			}
			return false;
		},
		// Resolves the actual color to use as an [r,g,b] array (0-255
		// each) from the plain color-picker hex field - onModelChange
		// keeps `color` itself synced to the colorHue wire whenever
		// it's actually connected, so there's nothing extra to resolve
		// here (same shape as getEffectiveBrightness() below).
		getEffectiveColorRgb: function() {
			return hexToRgb(this.model.get('color'));
		},
		// Resolves brightness (0-1) from the plain more-panel field -
		// onModelChange keeps `brightness` itself synced to the 'in'
		// wire (converted to the same 0-100 scale) whenever it's
		// actually driving brightness (non-vu mode, something wired),
		// so there's nothing extra to resolve here.
		getEffectiveBrightness: function() {
			return Math.max(0, Math.min(1, (parseFloat(this.model.get('brightness')) || 0) / 100));
		},
		// Wire-ready config object - see NEOPIXEL_REQUEST's own comment
		// in firmata_server.py/neopixel_output.py for the exact shape.
		buildConfig: function() {
			var rgb = this.getEffectiveColorRgb();
			return {
				pin: this.model.get('pin'),
				numPixels: Math.max(1, parseInt(this.model.get('numPixels'), 10) || 1),
				bpp: this.model.get('pixelFormat') === 'RGBW' ? 4 : 3,
				mode: this.model.get('mode'),
				speed: parseInt(this.model.get('speed'), 10) || 0,
				color: [rgb[0], rgb[1], rgb[2], 0],
				brightness: this.getEffectiveBrightness(),
				level: Math.max(0, Math.min(1023, parseInt(this.model.get('in'), 10) || 0)),
			};
		},
		enableDevice: function enableHardware() {
			var hardwareKey = this.getDeviceModelType() + ":" + this.getDeviceServerName() + ":" + this.getDeviceServerPort();

			// Same non-pin-write shape as Display.js's enableDevice -
			// Widget:sendNeoPixelConfig's own server-side handler
			// (nlMultiClientSync.js) already creates the hardware
			// model on demand if it doesn't exist yet, same as Push/
			// Pull and Display's own message do.
			window.app.vent.trigger('Widget:sendNeoPixelConfig', {
				hardwareKey: hardwareKey,
				config: this.buildConfig(),
			});
		},
		onRender: function() {
			if(!app.server) {
				rivets.formatters.isNetworkDeviceType = function(deviceType) {
					return deviceType === 'network';
				};
				rivets.formatters.isRing = function(previewShape) {
					return previewShape === 'ring';
				};
			}

			WidgetView.prototype.onRender.call(this);

			if(this.getDeviceModelType() === 'ArduinoUno') {
				this.requestSerialPorts();
			}

			if(!app.server) {
				// render() regenerates this widget's entire DOM from its
				// template (Backbone/Marionette re-render - not just
				// triggered by numPixels/previewShape changing, which
				// rebuildPixelIndexes() already handles, but also by
				// e.g. Patcher.js's mapToModel() calling view.render()
				// on every hardware connect/reconnect) - the fresh
				// .pixel divs have no inline style yet (CSS default is
				// black), but renderPreview()'s skip-if-unchanged color
				// cache doesn't know that and would otherwise think
				// they're already painted correctly, leaving them stuck
				// black. Found 2026-10-01: "the simulated display goes
				// black when I connect."
				this._lastPixelColors = [];
				this.layoutPreview();
				this._previewFrameCallback = this.renderPreview;
				window.app.timingController.registerFrameCallback(this._previewFrameCallback, this);
			}
		},

		// [0..numPixels-1] - exists purely so the template's
		// rv-each-pixelIndex loop has something to iterate (Rivets
		// needs a real array in the model, not just a count) to
		// produce the right number of .pixel divs for the simulated
		// preview.
		rebuildPixelIndexes: function() {
			var n = Math.max(1, Math.min(300, parseInt(this.model.get('numPixels'), 10) || 1));
			var indexes = new Array(n);
			for(var i=0; i<n; i++) { indexes[i] = i; }
			this.model.set('pixelIndexes', indexes);
			// Rivets rebuilds the .pixel divs to match - a fresh div at
			// index 0 starts with no inline style of its own, so last
			// frame's cached color string (renderPreview's change-
			// detection) would otherwise wrongly think it already
			// matches and skip writing it.
			this._lastPixelColors = [];
		},

		// Positions each .pixel div for the current previewShape.
		// "Strip" is plain CSS flexbox (no inline positioning needed -
		// see Widget.scss's .neoPixel rules); "Ring" places each pixel
		// with cos/sin around a center point, matching how a physical
		// NeoPixel ring is actually wired (pixel i at angle 2*PI*i/n).
		// Re-run whenever numPixels/previewShape change, not just once
		// on render - both can change live.
		layoutPreview: function() {
			var $preview = this.$('.neoPixelPreview');
			var $pixels = $preview.find('.pixel');
			var n = $pixels.length;
			if(n === 0) { return; }

			if(this.model.get('previewShape') === 'ring') {
				var radius = 32;
				var center = 40;
				for(var i=0; i<n; i++) {
					var angle = (2 * Math.PI * i / n) - (Math.PI / 2);
					var left = center + radius * Math.cos(angle) - 5;
					var top = center + radius * Math.sin(angle) - 5;
					$pixels.eq(i).css({position: 'absolute', left: left + 'px', top: top + 'px'});
				}
			}
			else {
				$pixels.css({position: '', left: '', top: ''});
			}
		},

		// Advances this._phase by (time since the last call / period),
		// wrapping at 1.0 - continuous regardless of period changing
		// between calls (speed can change live, including from a
		// jittering AnalogIn wired into the speed inlet), unlike
		// computing position directly from `now % period`, which jumps
		// to a basically unrelated value the instant period changes
		// even slightly - the same large, ever-increasing `now` lands
		// somewhere totally different modulo a different period.
		// Mirrors neopixel_output.py's _advance_phase() exactly (same
		// hardware-verified 2026-10-01 bug: chase's lit pixel jumping
		// all over the strip when speed varied) - this is the preview's
		// own copy since it renders independently in the browser.
		advancePhase: function(now, period) {
			if(this._phaseLastNow !== null && period > 0) {
				this._phase = (this._phase + (now - this._phaseLastNow) / period) % 1;
			}
			this._phaseLastNow = now;
			return this._phase;
		},

		// Browser-only simulated preview (per this project's own widget-
		// design principle - a widget should be testable with no
		// hardware attached) - runs the EXACT SAME pattern math as
		// neopixel_output.py's tick(), just in JS, driven by the shared
		// animation clock every other animated widget (Pulse/Tween)
		// already uses, rather than inventing a new timer here.
		// Preview render-rate cap - independent of, and on top of, the
		// skip-if-unchanged check further down. A chase/rainbow pattern
		// doesn't need 60fps to look smooth, and capping here bounds
		// the worst case to a fixed rate even while something's
		// actively wired into speed (constantly producing a genuinely
		// different color every single frame, which defeats the skip-
		// if-unchanged check below entirely) - found 2026-10-01: that
		// sustained 60fps DOM-write case was enough to suppress the
		// browser's native inlet tooltips while it was happening,
		// unlike AnalogOut (event-driven, no independent frame loop at
		// all) with the same wire.
		_PREVIEW_RENDER_INTERVAL_S: 1 / 14,

		renderPreview: function() {
			var now = Date.now() / 1000;
			if(this._lastPreviewRenderTime !== undefined &&
				now - this._lastPreviewRenderTime < this._PREVIEW_RENDER_INTERVAL_S) {
				return;
			}
			this._lastPreviewRenderTime = now;

			var $pixels = this.$('.neoPixelPreview .pixel');
			var n = $pixels.length;
			if(n === 0) { return; }

			var mode = this.model.get('mode');
			var rgb = this.getEffectiveColorRgb();
			var off = [0, 0, 0];
			var colors = new Array(n);
			var i;

			if(mode === 'chase') {
				var chasePeriod = speedToPeriodS(this.model.get('speed'));
				var pos = Math.floor(this.advancePhase(now, chasePeriod) * n);
				for(i=0; i<n; i++) { colors[i] = (i === pos) ? rgb : off; }
			}
			else if(mode === 'sparkle') {
				// Matches neopixel_output.py's _mode_sparkle: a new
				// random pattern every period/4 seconds, ~30% lit.
				var sparklePeriod = speedToPeriodS(this.model.get('speed')) / 4;
				var windowIndex = Math.floor(now / sparklePeriod);
				for(i=0; i<n; i++) {
					// Cheap deterministic pseudo-random from (window,
					// pixel index) - doesn't need to match the
					// device's own random sequence (that's cosmetic
					// only on each side), just needs to look like
					// sparkle and be stable within one window.
					var r = Math.abs(Math.sin(windowIndex * 999 + i * 57.13) * 43758.5453) % 1;
					colors[i] = (r < 0.3) ? rgb : off;
				}
			}
			else if(mode === 'rainbow') {
				var rainbowPeriod = speedToPeriodS(this.model.get('speed'));
				var offset = this.advancePhase(now, rainbowPeriod) * 255;
				for(i=0; i<n; i++) {
					colors[i] = colorwheel(offset + i * (255 / n));
				}
			}
			else if(mode === 'vu') {
				var level = Math.max(0, Math.min(1023, parseFloat(this.model.get('in')) || 0));
				var lit = Math.round(n * (level / 1023));
				for(i=0; i<n; i++) { colors[i] = (i < lit) ? rgb : off; }
			}
			else {
				// "full"
				for(i=0; i<n; i++) { colors[i] = rgb; }
			}

			// Only touch a pixel's style when its color actually
			// changed from last frame - found 2026-10-01: rewriting
			// every pixel's background-color on every animation frame
			// (30-60/sec) regardless of whether it changed was enough
			// constant DOM churn to suppress the browser's native
			// hover-tooltip timer on the widget's inlets (an unrelated
			// part of the DOM) while an animation was running. For
			// chase in particular this also cuts the writes from N
			// pixels/frame down to ~1-2, which it should be anyway.
			if(!this._lastPixelColors) { this._lastPixelColors = []; }
			var brightness = this.getEffectiveBrightness();
			for(i=0; i<n; i++) {
				var c = colors[i];
				var css = 'rgb(' + Math.round(c[0] * brightness) + ',' + Math.round(c[1] * brightness) + ',' + Math.round(c[2] * brightness) + ')';
				if(this._lastPixelColors[i] !== css) {
					this._lastPixelColors[i] = css;
					$pixels[i].style.backgroundColor = css;
				}
			}
		},
	});
});
