
module.exports = function(attributes) {
	var argHostPort = process.argv[3] ? process.argv[3].split(":") : undefined;

	var _ = require('underscore'),
		five = require("johnny-five"),
		net = require("net"),
		firmata = require("firmata"),
		events = require('events'),
		pollIntervalMod = 1,
		mkrHost = argHostPort !== undefined ? argHostPort[0] : "10.0.1.2",
		mkrPort = argHostPort !== undefined ? parseInt(argHostPort[1],10) : 3030;

	var constructor = function() {
		var self = this;

		var client = net.connect({host: mkrHost, port: mkrPort}, function() {
			var socketClient = this;

			console.log('Connected to MKR1000...');
			var io = new firmata.Board(socketClient);

			io.once('ready', function() {
				self.board = five.Board({
					io: io,
					repl: false,
				});

				self.board.on("ready", function() {
					self.connected = true;
					self.addDefaultPins.call(self);
				});
				self.board.on('error', function(err) {
					console.log(err);
				});
			});
		});

	};

	events.EventEmitter.call(constructor.prototype);
	_.extend(constructor.prototype, events.EventEmitter.prototype);

	// Base HardwareModel class
	var johnnyFiveHardwareModel = {
		init: function() {
			var self = this;

			var client = net.connect({host: mkrHost, port: mkrPort}, function() {
				var socketClient = this;

				var io = new firmata.Board(socketClient);

				io.once('ready', function() {
					self.board = five.Board({
						io: io,
						repl: false,
					});

					self.board.on("ready", function() {
						self.connected = true;
						self.addDefaultPins.call(self);
					});
					self.board.on('error', function(err) {
						console.log(err);
					});
				});
			});

			return this;
		},
		addDefaultPins: function addDefaultPins() {
			self = this;
			// Store all pin mode mappings (string -> integer)
			this.PINMODES = this.board.io.MODES;

			var pollFreq = 100;

			// Instantiate each sensor listed on the model to the sensors array
			for(var input in this.inputs) {

				(function() {
					if(!parseInt(input, 10)) {
						var sensor = five.Sensor({
							pin: input,
							freq: pollFreq,
						});

						this.inputs[input].pin = sensor;

						sensor.scale([0, 1023]).on("data", function() {
							self.set('A'+this.pin, Math.floor(this.value));
						});
					}
					else {
						this.board.pinMode(input, five.Pin.INPUT);
					}

				}.bind(this))();
			}


			// Cycle through and add all the outputs here
			for(var output in this.outputs) {
				(function() {
					// hack for right now to hard code pin <3 as pwm, pin 9 as servo
					var pin = parseInt(output.substr(1),10);
					var outputPin;

					if (pin === 3 || pin === 5 || pin === 6 || pin === 10 || pin === 11) {
						outputPin = new five.Led(pin);
					} 
					else if(pin === 9) {
						outputPin = new five.Servo({
							pin: pin,
							range: [0,180],
						});
					}

					this.outputs[output].pin = outputPin;

				}.bind(this))();
			}

		},
		get: function(field) {
			return this.inputs[field].value;
		},
		set: function(field, value) {
			if(this.outputs[field] !== undefined) {
				if(parseInt(this.outputs[field].value,10) !== parseInt(value,10)) {
					this.outputs[field].value = value;
					this.setHardwarePin(field, value);
				}
			}
			else if(this.inputs[field] != undefined) {
				if(parseInt(this.inputs[field].value, 10) !== parseInt( value, 10 )) {
					this.inputs[field].value = value;
					this.emit('change', {field: field, value: this.inputs[field].value});
				}
			}
			return this;
		},
		setHardwarePin: function(field, value) {
			var outputField = this.outputs[field];

			// PINS 10 and up are currently not supported by libmraa
			if(outputField !== undefined && field === 'D2' || field === 'D3' || field === 'D4' || field === 'D5') {
				var pinMode = outputField.pin.mode;

				// Check which pinmode is set on the pin to detemine which method to call
				if (pinMode === this.PINMODES.PWM || pinMode === this.PINMODES.OUTPUT) {
					this.outputs[field].pin.brightness(value);

				} else if(pinMode === this.PINMODES.SERVO) {
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
			console.log('setting pin mode', pin, mode);
			if(this.connected) {
				// Always immediately set an input to a Sensor. If it is already a sensor, then we are resetting it
				if(mode === 'INPUT') {
					// remove any listeners on the current pin
					this.inputs[pin] && this.inputs[pin].pin.off('data');

					// delete this pin if it exists in the outputs
					delete this.outputs[pin].pin;

					var sensor = five.Sensor({
						pin: input,
						freq: pollFreq,
					});

					sensor.scale([0, 1023]).on("data", function() {
						self.set('A'+this.pin, Math.floor(this.value));
					});

					this.inputs[pin].pin = sensor;
				}
				else if(mode === 'ANALOG') {
				}
				else if(mode === 'PWM' || mode === 'OUTPUT') {
					var hardwarePin = parseInt(pin.substr(1),10);

					var outputPin = five.Led(hardwarePin);
					this.outputs[pin].pin = outputPin;
				}
				else if(mode === 'SERVO') {
					var hardwarePin = parseInt(pin.substr(1),10);

					var outputPin = five.Servo({
						pin: hardwarePin,
						range: [0,180],
					});

					this.outputs[pin].pin = outputPin;
				}
				else if(mode === 'STEPPER') {
				}
				else if(mode === 'I2C') {
				}

			}
			//SHIFT: 5,
			//ONEWIRE: 7,
		},
		setPollSpeed: function(highLow) {
			if(highLow == 'fast') {
				console.log('setting fast');
				pollIntervalMod = 1;
			}
			else {
				console.log('setting slow');
				pollIntervalMod = 1;
			}
		},
	};
	_.extend(constructor.prototype, johnnyFiveHardwareModel);


	_.extend(constructor.prototype, {
		type: 'ArduinoUno',
		inputs: {
			A0: {pin: {}, value: 0},
			A1: {pin: {}, value: 0},
			A2: {pin: {}, value: 0},
			A3: {pin: {}, value: 0},
			//A4: {pin: {}, value: 0},
			//A5: {pin: {}, value: 0},
			//A6: {pin: {}, value: 0},
		},
		outputs: {
			D0: {pin: {}, value: 0},
			D1: {pin: {}, value: 0},
			D2: {pin: {}, value: 0},
			D3: {pin: {}, value: 0},
			D4: {pin: {}, value: 0},
			D5: {pin: {}, value: 0},
			D6: {pin: {}, value: 0},
			D7: {pin: {}, value: 0},
			D8: {pin: {}, value: 0},
			D9: {pin: {}, value: 0},
			D10: {pin: {}, value: 0},
			D11: {pin: {}, value: 0},
			D12: {pin: {}, value: 0},
			D13: {pin: {}, value: 0},
			D14: {pin: {}, value: 0},
		},
	});

	_.extend(constructor.prototype, attributes);

	var newObj = new constructor();
	return newObj;
};
