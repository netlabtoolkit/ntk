define([
	'backbone',
	'rivets',
	'views/item/WidgetMulti',
	'text!./template.js',
],
function(Backbone, rivets, WidgetView, Template){
	'use strict';

	return WidgetView.extend({
		typeID: 'Display',
		deviceMode: 'out',
		categories: ['I/O'],
		className: 'displayWidget',
		template: _.template(Template),
		widgetEvents: {
			'mousedown .serialPortPicker': 'requestSerialPorts',
		},

		// Three lines, not four - the OLED has five lines total; two
		// are reserved for system status (IP/RSSI, device mode), see
		// oled_display.py's own module docstring.
		ins: [
			{title: 'line 1', to: 'in1'},
			{title: 'line 2', to: 'in2'},
			{title: 'line 3', to: 'in3'},
		],
		sources: [],

		initialize: function(options) {
			WidgetView.prototype.initialize.call(this, options);

			this.model.set({
				title: 'Display',
				activeOut: false,
				port: this.model.get('port') || 3030,
				in1: this.model.get('in1') || '',
				in2: this.model.get('in2') || '',
				in3: this.model.get('in3') || '',
				line1Prepend: this.model.get('line1Prepend') || '',
				line1Append: this.model.get('line1Append') || '',
				line2Prepend: this.model.get('line2Prepend') || '',
				line2Append: this.model.get('line2Append') || '',
				line3Prepend: this.model.get('line3Prepend') || '',
				line3Append: this.model.get('line3Append') || '',
				// Decimal places a NUMBER on each line is shown with (see
				// formatValue). 2 is the long-standing behaviour; 0 is
				// for whole-number values such as a clock's hour.
				line1Decimals: this.model.get('line1Decimals') === undefined ? 2 : this.model.get('line1Decimals'),
				line2Decimals: this.model.get('line2Decimals') === undefined ? 2 : this.model.get('line2Decimals'),
				line3Decimals: this.model.get('line3Decimals') === undefined ? 2 : this.model.get('line3Decimals'),
				// Optional per-line format (see composeFormat). When set
				// it replaces that line's prepend + value + append, and
				// can use any of the three inputs: "<1:2>:<2:2>:<3:2>"
				// turns hour/minute/second into "14:05:09" on one line.
				// Per-line "blank" checkbox: the line shows nothing, whatever
				// is wired into its inlet. For an inlet that is only there
				// to feed another line's format (minute and second in the
				// time readout above would otherwise also appear on lines
				// 2 and 3).
				line1Blank: this.model.get('line1Blank') === true,
				line2Blank: this.model.get('line2Blank') === true,
				line3Blank: this.model.get('line3Blank') === true,
				line1Format: this.model.get('line1Format') || '',
				line2Format: this.model.get('line2Format') || '',
				line3Format: this.model.get('line3Format') || '',
			});

			// Composes the initial line1Text/line2Text/line3Text so the
			// widget's own preview (and a device already active) show
			// the right thing immediately, not just after the first
			// inlet change.
			this.rebuild();

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
			if(changed.deviceType) {
				this.model.set({deviceType: changed.deviceType, activeOut: false});
				if(!app.server && changed.deviceType !== "network") {
					this.requestSerialPorts();
				}
			}

			// Recompute composed lines on any relevant change - same
			// pattern as Concat.js's rebuild(). Skip when ONLY our own
			// computed line*Text fields moved (avoid a pointless
			// second pass from our own write below).
			var onlyComputedChanged = true;
			for(var key in changed) {
				if(key !== 'line1Text' && key !== 'line2Text' && key !== 'line3Text' &&
				   key !== 'line1Value' && key !== 'line2Value' && key !== 'line3Value') {
					onlyComputedChanged = false;
					break;
				}
			}
			if(!onlyComputedChanged) {
				this.rebuild();
			}

			var inactiveModels = this.inactiveModelsExist();

			// Same "changed.activeOut === true directly captures the
			// user just turned this on" reasoning as AnalogOut.js's own
			// onModelChange - see its comment for the fuller history.
			if( (inactiveModels || changed.activeOut === true) && this.model.get("activeOut") == true ) {
				var modelType = this.getDeviceModelType();

				this.unMapHardwareInlet();

				var server = this.getDeviceServerName();
				var port = this.getDeviceServerPort();

				app.Patcher.Controller.mapToModel({
					view: this,
					modelType: modelType,
					// destinationField is a sentinel, not a real pin -
					// Display has no pin (see DISPLAY_TEXT_REQUEST in
					// firmata_server.py). Kept in the same shape as
					// every other hardware-output widget's mapping
					// purely for this.sources/widgetMappings bookkeeping
					// consistency (cable rendering, reconnect detection).
					IOMapping: {sourceField: "out", destinationField: 'display'},
					server: server + ":" + port,
				}, true);

				this.enableDevice();
			}
			else if(this.model.get('activeOut') === true &&
				(changed.line1Text !== undefined || changed.line2Text !== undefined || changed.line3Text !== undefined)) {
				// Already connected - push ongoing changes too. AnalogOut/
				// DigitalOut/Servo get this for free from WidgetMulti.js's
				// checkOutputMappingUpdate (keys off a single 'out' field
				// changing); Display has three composed fields instead of
				// one, so that generic mechanism never fires for it -
				// handled directly here instead, same intent.
				this.enableDevice();
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
			// Same cable-orphan fix as AnalogOut/DigitalOut/Servo (see
			// their identical comment for the fuller history) - only
			// removes the HARDWARE mapping. Inverted from those widgets'
			// version: they keep the one real inlet name ('in') and
			// remove everything else; Display has three real inlet
			// names (in1/in2/in3), so it's simpler to recognize the one
			// hardware sentinel ('display') and remove only that.
			var kept = [];
			for(var i=0; i<this.sources.length; i++) {
				if(this.sources[i].map.destinationField === 'display') {
					window.app.vent.trigger('Widget:removeMapping', this.sources[i], this.model.get('wid'));
				}
				else {
					kept.push(this.sources[i]);
				}
			}
			this.sources = kept;
		},
		enableDevice: function enableHardware() {
			var hardwareKey = this.getDeviceModelType() + ":" + this.getDeviceServerName() + ":" + this.getDeviceServerPort();

			// No Widget:hardwareSwitch trigger here (unlike AnalogOut/
			// DigitalOut/Servo) - that sets a PIN's mode, and Display has
			// no pin to set one on (DISPLAY_TEXT_REQUEST is a standalone
			// sysex message, mode-agnostic). Widget:sendDisplayText's own
			// server-side handler (nlMultiClientSync.js) already creates
			// the hardware model on demand if it doesn't exist yet, same
			// as Push/Pull do, so there's no lost benefit from skipping it.
			window.app.vent.trigger('Widget:sendDisplayText', {
				hardwareKey: hardwareKey,
				lines: [
					this.model.get('line1Text') || '',
					this.model.get('line2Text') || '',
					this.model.get('line3Text') || '',
				],
			});
		},
		onRender: function() {
			if(!app.server) {
				rivets.formatters.isNetworkDeviceType = function(deviceType) {
					return deviceType === 'network';
				};
			}

			WidgetView.prototype.onRender.call(this);

			if(this.getDeviceModelType() === 'ArduinoUno') {
				this.requestSerialPorts();
			}
		},

		// Composes each line as prepend + value + append and stores it
		// on line1Text/line2Text/line3Text - both what the widget's own
		// preview renders (rv-text in the template) and what
		// enableDevice() actually sends.
		rebuild: function() {
			for(var i = 1; i <= 3; i++) {
				var prepend = this.model.get('line' + i + 'Prepend') || '';
				var append = this.model.get('line' + i + 'Append') || '';
				var v = this.model.get('in' + i);
				var vText = this.formatValue(v, this.model.get('line' + i + 'Decimals'));
				// line<i>Value is the formatted value on its own - the
				// more panel's preview between the prepend/append fields
				// binds to it, so the preview and what is sent can't
				// disagree about the number of decimals.
				this.model.set('line' + i + 'Value', vText);
				var format = this.model.get('line' + i + 'Format');
				var text = (typeof format === 'string' && format !== '') ?
					this.composeFormat(format) : prepend + vText + append;
				if(this.model.get('line' + i + 'Blank') === true) { text = ''; }
				this.model.set('line' + i + 'Text', text);
			}
		},

		// Numeric inputs are shown to a FIXED number of decimal places,
		// set per line in the "more" panel (default 2). Fixed, rather
		// than "as many as the number happens to have": a wired-in
		// value is often a raw sensor/computed reading with many more
		// digits than the OLED has room for, and a constant precision
		// (5 -> "5.00") keeps a line from jumping width as the value
		// changes. 0 gives whole numbers (14, not 14.00) for values
		// that are whole by nature - a clock's hour, a count. A missing
		// or unusable setting falls back to 2; more than 4 is capped.
		// Non-numeric values (strings) pass through unchanged. The
		// standalone interpreter's _eval_display mirrors this.
		// A line's format string, with its placeholders filled in - the
		// same <1> <2> <3> convention as Webhook's URL template, where
		// the number is one of this widget's three INPUTS (not lines):
		//   <2>     input 2, formatted as on its own line (formatValue
		//           with line 2's decimals)
		//   <2:2>   the same, with a number's whole part padded with
		//           zeros to at least 2 digits (5 -> "05") - what a time
		//           readout needs. One digit, 1-9; text values are never
		//           padded.
		// Anything else in the string is kept as typed. The standalone
		// interpreter's _display_format mirrors this exactly.
		composeFormat: function(format) {
			var self = this;
			return format.replace(/<([123])(?::(\d))?>/g, function(match, n, pad) {
				var v = self.model.get('in' + n);
				var text = self.formatValue(v, self.model.get('line' + n + 'Decimals'));
				if(pad && typeof v === 'number') { text = self.zeroPad(text, parseInt(pad, 10)); }
				return text;
			});
		},

		// "5" -> "05", "5.25" -> "05.25", "-5" -> "-05" for width 2.
		zeroPad: function(text, width) {
			var negative = text.charAt(0) === '-';
			var body = negative ? text.slice(1) : text;
			var dot = body.indexOf('.');
			var whole = dot === -1 ? body : body.slice(0, dot);
			var rest = dot === -1 ? '' : body.slice(dot);
			while(whole.length < width) { whole = '0' + whole; }
			return (negative ? '-' : '') + whole + rest;
		},

		formatValue: function(v, decimals) {
			if(v === undefined || v === null || v === '') { return ''; }
			if(typeof v === 'number') {
				var places = parseInt(decimals, 10);
				if(isNaN(places) || places < 0) { places = 2; }
				return v.toFixed(Math.min(places, 4));
			}
			return String(v);
		},
	});
});
