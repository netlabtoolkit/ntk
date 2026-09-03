module.exports = function(five) {
	var pollIntervalMod = 1;

	// Custom sysex extension (not part of the Firmata spec) matching
	// firmware/xiao-esp32c6-circuitpython-firmata/firmata_server.py's
	// constants of the same name byte-for-byte - lets a GroveSensor
	// widget subscribe to an I2C sensor the firmware already knows how
	// to read (see that file's module docstring for why this exists
	// instead of a generic I2C passthrough).
	var GROVE_SENSOR_REQUEST = 0x01;
	var GROVE_SENSOR_REPLY = 0x02;
	var GROVE_SUBSCRIBE = 1;
	var GROVE_UNSUBSCRIBE = 2;
	var GROVE_READINGS = 1;
	var GROVE_STATUS = 2;

	// Decodes one of firmware's 3x-7-bit-byte, x100 fixed-point Grove
	// sensor values (see _encode_grove_value in firmata_server.py) back
	// into a float - the reverse of that exact encoding.
	function decodeGroveValue(b0, b1, b2) {
		var raw = (b0 & 0x7F) | ((b1 & 0x7F) << 7) | ((b2 & 0x7F) << 14);
		if(raw & 0x100000) {
			raw -= 0x200000; // sign-extend from a 21-bit two's complement field
		}
		return raw / 100;
	}

	var StandardFirmataModel = {
		addDefaultPins: function addDefaultPins() {
			self = this;
			// Store all pin mode mappings (string -> integer)
			this.PINMODES = this.board.io.MODES;

			var pollFreq = 100;

			for(var index in this.board.pins) {
				var reportedPin = this.board.pins[index];
				if(reportedPin.analogChannel < 127) {
					var sensor = new five.Sensor({
						pin: "A"+reportedPin.analogChannel,
						freq: pollFreq,
					});

					sensor.scale([0, 1023]).on("data", function() {
						self.set("A"+this.pin, Math.floor(this.value));
					});

					this.inputs["A"+reportedPin.analogChannel] = {pin: sensor, value: 0};
				}
				else {
					//this.outputs["D"+index] = {pin: {}, value: 0, supportedModes: reportedPin.supportedModes};
					this.outputs["D"+index] = {pin: reportedPin,  value: 0, supportedModes: reportedPin.supportedModes};
				}
			}

			// Firmata.SYSEX_RESPONSE (inside firmata-io) is a class-level
			// registry shared across every Board instance, not per-board -
			// addDefaultPins() runs again on every reconnect against a
			// brand new Board, so without clearing first, sysexResponse()
			// below throws "already registered" on the second connection
			// onward.
			this.board.io.clearSysexResponse(GROVE_SENSOR_REPLY);
			this.board.io.sysexResponse(GROVE_SENSOR_REPLY, function(data) {
				var subType = data[0];
				var sensorId = data[1] | (data[2] << 7);

				if(subType === GROVE_READINGS) {
					var readingCount = data[3];
					for(var i = 0; i < readingCount; i++) {
						var offset = 4 + i * 3;
						var value = decodeGroveValue(data[offset], data[offset + 1], data[offset + 2]);
						// Numeric reading index, not a name - the catalog
						// entry on the client side (sensorCatalog.js) is
						// what maps index -> a human label/outlet.
						var field = "grove-" + sensorId + "-" + i;

						self.inputs[field] = {value: value};
						self.emit('change', {field: field, value: value});
					}
				}
				else if(subType === GROVE_STATUS) {
					var field = "grove-" + sensorId + "-status";
					self.inputs[field] = {value: data[3]};
					self.emit('change', {field: field, value: data[3]});
				}
			});
		},
		get: function(field) {
			field = field.toUpperCase();
			return this.inputs[field].value;
		},
		set: function(field, value, modeRequested) {
			field = field.toUpperCase();
			value = parseInt(value, 10);


			if(!this.connected) {
				var self = this;
				setTimeout(function() {
					self.set(field, value, modeRequested);
				}, 500);
			}
			if(this.inputs[field] != undefined) {

				if(parseInt(this.inputs[field].value, 10) !== parseInt( value, 10 )) {
					this.inputs[field].value = value;
					this.emit('change', {field: field, value: this.inputs[field].value});
				}
			}
			else if(this.outputs[field] !== undefined) {
				if( (modeRequested !== undefined) || parseInt(this.outputs[field].value,10) !== parseInt(value,10)) {
					this.outputs[field].value = value;

					if(this.connected) {
						this.setHardwarePin(field, value, modeRequested);
					}
				}
			}

			return this;
		},
		setHardwarePin: function(field, value, modeRequested) {
			field = field.toUpperCase();

			var outputField = this.outputs[field],
				modeSupported = false;

			if(outputField && outputField.pin) {
				//var pinMode = outputField.pin.mode;
				var pinMode = modeRequested;

				// Check if this mode is supported on this pin
				for(var mode in this.outputs[field].supportedModes) {
					var supportedMode = this.outputs[field].supportedModes[mode];
					// TODO: Casts a string in "supportMode" to an int for loose comparison.
					if(supportedMode == pinMode) {
						modeSupported = true;

						// TODO: PROBLEM. SOmetimes this is undefined
						// TODO Update: Don't need this anymore since it is not set on each "set" command. So just let it go through since it is rare.
						//if(this.outputs[field].pin.board == undefined) {
							//var currentPinModeInteger = this.outputs[field].pin.mode;
						//}
						//else {
							//var currentPinModeInteger = this.outputs[field].pin.board.pins[this.outputs[field].pin.pin].mode;
						//}

						//if(parseInt(supportedMode,10) !== this.outputs[field].pin.mode) {
						//if(parseInt(supportedMode,10) !== currentPinModeInteger) {
							var PINMODESTRINGS = _.invert(this.PINMODES);
							this.setIOMode(field, PINMODESTRINGS[supportedMode] );
						//}
					}
				}


				// Doesn't even try if the pinmode is not supported.
				if(!modeSupported && (pinMode !== undefined) ) { return false; }
			}


			if(outputField !== undefined) {

				// If we don't have the pinmode from the front end, then grab what it was previously
				if(pinMode == undefined) {
					if(outputField.pin.board == undefined) {
						pinMode = outputField.pin.mode;
					}
					else {
						pinMode = outputField.pin.board.pins[outputField.pin.pin].mode;
					}
				}

				// Check which pinmode is set on the pin to detemine which method to call
				if(pinMode === this.PINMODES.PWM) {
					this.outputs[field].pin.brightness(value);
				}
				else if(pinMode === this.PINMODES.OUTPUT) {
					if(value >= 255) {
						this.outputs[field].pin.on();
					}
					else {
						this.outputs[field].pin.off();
					}
				}
				else if(pinMode === this.PINMODES.SERVO) {
					this.outputs[field].pin.to(value);
				}

				// For reference:
				//MODES:
				//{ INPUT: 0,
				//OUTPUT: 1,
				//ANALOG: 2,
				//PWM: 3,
				//SERVO: 4,
				//SHIFT: 5,
				//I2C: 6,
				//ONEWIRE: 7,
				//STEPPER: 8,
				//IGNORE: 127,
				//UNKOWN: 16 },

			}
		},
		setIOMode: function setPinMode(pin, mode, extraOptions) {
			pin = pin.toUpperCase();

			// The device connection (and the Firmata handshake after it)
			// can take several seconds - a request to switch a pin's mode
			// that arrives before then (e.g. DigitalIn's initial
			// INPUT-mode switch, sent right after the widget is created)
			// used to be silently dropped since there was no retry here,
			// unlike set()'s equivalent guard below. Retry until connected
			// instead of giving up.
			if(!this.connected) {
				// NOT "var self" - the rest of this function (and its
				// nested callbacks, e.g. the digital-read listener below)
				// already relies on the bare global `self` addDefaultPins()
				// assigns (no "var" there either). Redeclaring it here
				// would hoist a function-scoped `self` that only actually
				// gets assigned on this branch, leaving it undefined on
				// every call that skips this retry (i.e. the normal,
				// already-connected path) - crashing anything below that
				// reads `self`.
				var retryModel = this;
				setTimeout(function() {
					retryModel.setIOMode(pin, mode, extraOptions);
				}, 500);
				return;
			}

			if(mode === 'GROVE_SENSOR') {
				// Not a real pin - "pin" here is a GroveSensor catalog id
				// (see firmware pins.py's GROVE_SENSOR_CATALOG), so none of
				// the outputs[pin]/supportedModes machinery below applies.
				var sensorId = parseInt(pin, 10);
				var message = [GROVE_SENSOR_REQUEST, GROVE_SUBSCRIBE, sensorId & 0x7F, (sensorId >> 7) & 0x7F];

				// A "needs_pin" sensor (e.g. DHT11 - not on the shared I2C
				// bus, so the firmware can't probe it, only the widget
				// knows which GPIO it's wired to) includes a 4th byte: the
				// Firmata pin index (see pins.py's PIN_TABLE) to read from.
				// extraOptions.pin arrives as NTK's usual "D6"-style pin
				// name (see DigitalIn's own pin field/StandardFirmataModel
				// .js's "D"+index convention in addDefaultPins) - strip the
				// "D" to get the raw index the firmware's self.pins[] uses.
				// Omitted entirely for I2C sensors, which don't need it.
				if(extraOptions && extraOptions.pin) {
					var pinIndex = parseInt(String(extraOptions.pin).replace(/^D/i, ''), 10);
					if(!isNaN(pinIndex)) {
						message.push(pinIndex & 0x7F);
					}
				}
				// A "needs_mode" sensor (e.g. TSL2561 - one I2C sensor
				// with several different readings, selected by the
				// widget's own mode dropdown rather than a physical
				// wiring choice) includes the same 4th byte instead, as a
				// small integer whose meaning is entirely up to that
				// sensor's own pins.py entry (see its needs_mode
				// handling). Named sensorMode, NOT mode - extraOptions IS
				// this whole hardwareSwitch payload (see nlMultiClientSync
				// .js's client:changeIOMode), and `mode` on it already
				// means the Firmata IO-mode string this function's own
				// `mode` parameter holds ('GROVE_SENSOR' here) - reusing
				// that name for a per-sensor value would collide with it.
				// Mutually exclusive with pin above - no sensor needs both
				// today. !== undefined (not a truthy check) since a
				// sensor's own mode 0 can be a real, meaningful selection,
				// not "unset".
				else if(extraOptions && extraOptions.sensorMode !== undefined) {
					var sensorModeValue = parseInt(extraOptions.sensorMode, 10);
					if(!isNaN(sensorModeValue)) {
						message.push(sensorModeValue & 0x7F);
					}
				}

				this.board.io.sysexCommand(message);
				return;
			}

			if(this.outputs[pin] === undefined) {
				// A pin the device never reported (e.g. DigitalIn's D12
				// default on a board that only has D0-D10) - previously
				// this threw here uncaught (crashing the whole app) once
				// the retry above actually got a chance to run against a
				// connected board; nothing to switch modes on, so just
				// give up on this pin quietly instead.
				console.log('setIOMode: pin', pin, 'was never reported by this device - ignoring');
				return;
			}

			if(this.connected == true) {

				// Check if this mode is supported on this pin
				var modeSupported = false;

				var modeInt = this.PINMODES[mode];
				for(var supportedMode in this.outputs[pin].supportedModes) {
					if(this.outputs[pin].supportedModes[supportedMode] == modeInt) {
						modeSupported = true;
					}
				}

				// If we don't support this mode on this pin then immediately return
				if(!modeSupported && mode !== 4) { return false; }

				// Always immediately set an input to a Sensor. If it is already a sensor, then we are resetting it
				if(mode == 'INPUT') {
					var pinExists = (this.inputs[pin] !== undefined || this.outputs[pin] !== undefined);

					if(pinExists) {
						var hardwarePinNumber = parseInt(pin.substr(1), 10);
						var boardIO = this.board.io;

						// delete this pin if it exists in the outputs
						delete this.outputs[pin].pin;

						// Deliberately not five.Button here (unlike five.Led
						// for OUTPUT above, for a different reason) -
						// confirmed via the device's own wire-level debug
						// log that Button's internal reportDigitalPin enable
						// call never actually reached the device, even
						// though its earlier pinMode(INPUT) call did -
						// something about how it resolves its controller on
						// this board/johnny-five combination skips it. Ask
						// the raw board directly instead and mirror the
						// pin's live HIGH/LOW state continuously, which is
						// also a better match for what "DigitalIn" means
						// than Button's press/release-edge abstraction.
						var digitalReadEvent = 'digital-read-' + hardwarePinNumber;
						boardIO.removeAllListeners(digitalReadEvent);
						boardIO.on(digitalReadEvent, function(value) {
							self.set(pin, value ? 1023 : 0);
						});

						boardIO.pinMode(hardwarePinNumber, this.PINMODES.INPUT);
						boardIO.reportDigitalPin(hardwarePinNumber, 1);

						this.inputs[pin] = {
							// setHardwarePin's fallback (see the OUTPUT case
							// above) reads a pin's current mode off this
							// object - harmless to set for an input, but
							// kept for consistency.
							pin: {mode: this.PINMODES.INPUT},
							value: 0,
						};
					}
				}
				else if(mode === 'ANALOG') {
				}
				else if(mode === 'PWM') {
					var pinExists = this.outputs[pin] !== undefined;
					if(pinExists) {
						var currentPin = this.outputs[pin].pin;

						if( !(currentPin instanceof five.Led) ) {
							var hardwarePin = parseInt(pin.substr(1),10);

							var outputPin = new five.Led(hardwarePin);
							this.outputs[pin].pin = outputPin;
						}
					}
				}
				else if(mode === 'OUTPUT') {
					var pinExists = this.outputs[pin] !== undefined;
					if(pinExists) {
						var hardwarePin = parseInt(pin.substr(1),10);
						var boardIO = this.board.io;

						// Deliberately not five.Led here (unlike the PWM
						// case above) - Led's own constructor
						// (server/node_modules/johnny-five/lib/led/led.js)
						// independently decides to prefer PWM mode
						// whenever the pin supports it, regardless of
						// what mode was actually requested here, turning
						// a plain digital on/off into a continuously
						// fading PWM output. Drive the pin directly via
						// the raw board so OUTPUT really means a clean
						// HIGH/LOW, matching a DigitalOut widget's intent.
						boardIO.pinMode(hardwarePin, this.PINMODES.OUTPUT);
						this.outputs[pin].pin = {
							// setHardwarePin's fallback (used whenever
							// modeRequested isn't explicitly passed, which
							// is every ongoing update after the first)
							// reads the pin's current mode straight off
							// this object via `.mode` (or `.board.pins[...]
							// .mode` if `.board` is set) - without this,
							// every update after the first-ever explicit
							// mode request resolved to an undefined
							// pinMode and silently did nothing.
							mode: this.PINMODES.OUTPUT,
							on: function() { boardIO.digitalWrite(hardwarePin, boardIO.HIGH); },
							off: function() { boardIO.digitalWrite(hardwarePin, boardIO.LOW); },
						};
					}
				}
				else if(mode === 'SERVO') {
					var pinExists = this.outputs[pin] !== undefined;

					if(pinExists) {
						var hardwarePin = parseInt(pin.substr(1),10);

						var outputPin = new five.Servo({
							pin: hardwarePin,
							range: [0,180],
						});

						this.outputs[pin].pin = outputPin;
					}
				}
				else if(mode === 'STEPPER') {
				}
				else if(mode === 'I2C') {
				}

			}
		},
		setPollSpeed: function(highLow) {
			if(highLow == 'fast') {
				pollIntervalMod = 1;
			}
			else {
				pollIntervalMod = 30;
			}
		},
		inputs: {},
		outputs: {},
	};

	return StandardFirmataModel;
};
