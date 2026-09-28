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
				if(key !== 'line1Text' && key !== 'line2Text' && key !== 'line3Text') {
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
				// More panel's prepend|value|append preview - a pure
				// function of v (no `this`), so, like isNetworkDeviceType
				// above, it's harmless that rivets.formatters is one
				// global registry shared across every Display instance -
				// they'd all register the exact same behavior anyway.
				// Kept as a duplicate of formatValue() rather than a
				// bound reference to one specific instance's method,
				// since a closure over a particular widget's `this`
				// here would silently apply to every OTHER Display
				// widget's binding too once multiple exist on canvas.
				rivets.formatters.displayValuePreview = function(v) {
					if(v === undefined || v === null || v === '') { return ''; }
					if(typeof v === 'number') {
						return v.toFixed(2);
					}
					return String(v);
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
				var vText = this.formatValue(v);
				this.model.set('line' + i + 'Text', prepend + vText + append);
			}
		},

		// Numeric inputs are always shown to exactly 2 decimal places -
		// a wired-in value is often a raw sensor/computed reading with
		// many more digits than the OLED has room to show, or than
		// makes sense to a viewer, and a fixed hundredths precision
		// (5 -> "5.00", not just "5") makes a column of these line up
		// consistently rather than jumping width depending on whatever
		// happened to be connected. Non-numeric values (strings) pass
		// through unchanged. Shared by rebuild() (what actually gets
		// sent) and the more panel's live value preview (rv-text in
		// the template), so both always agree on what the "value"
		// piece of prepend|value|append is.
		formatValue: function(v) {
			if(v === undefined || v === null || v === '') { return ''; }
			if(typeof v === 'number') {
				return v.toFixed(2);
			}
			return String(v);
		},
	});
});
