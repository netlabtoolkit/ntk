module.exports = function(five) {
	var pollIntervalMod = 1;

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
		setIOMode: function setPinMode(pin, mode) {
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
					retryModel.setIOMode(pin, mode);
				}, 500);
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
