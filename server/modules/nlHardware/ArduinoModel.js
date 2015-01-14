
module.exports = function(attributes) {

	var _ = require('underscore'),
		five = require("johnny-five"),
		events = require('events'),
		self = this;

	events.EventEmitter.call(this);
	_.extend(this, events.EventEmitter.prototype);

	// Base HardwareModel class
	var johnnyFiveHardwareModel = {
		init: function() {
			this.board = five.Board();

			this.board.on("ready", function() {
				addDefaultPins.call(self);
			});
			this.board.on('error', function(err) {
				console.log(err);
			});

			return this;
		},
		addDefaultPins: function addDefaultPins() {
			// Store all pin mode mappings (string -> integer)
			this.PINMODES = this.board.io.MODES;

			var pollFreq = 100;

			// Instantiate each sensor listed on the model to the sensors array
			for(var input in this.inputs) {

				(function() {
					if(!parseInt(input, 10)) {
						var sensor = new five.Sensor({
							pin: input,
							//freq: 25,
							freq: pollFreq,
						});

						self.inputs[input].pin = sensor;

						//board.repl.inject({
						//sensor: sensor
						//});

						var sensorField = input;
						sensor.scale([0, 1023]).on("data", function() {
							self.set(sensorField, Math.floor(this.value));
						});
					}
					else {
						this.board.pinMode(input, five.Pin.INPUT);
					}

				})();
			}


			// Cycle through and add all the outputs here
			for(var output in this.outputs) {
				(function() {
					// hack for right now to hard code pin <3 as pwm, pin 9 as servo
					var pin = parseInt(output.substr(1),10);
					var outputPin;

					if (pin < 9) {
						outputPin = new five.Led(pin);
					} else {
						outputPin = new five.Servo({
							pin: pin,
							range: [0,180],
						});
					}

					this.outputs[output].pin = outputPin;

				})();
			}

		},
		get: function(field) {
			return this.inputs[field].value;
		},
		set: function(field, value) {
			if(this.outputs[field] !== undefined) {
				if(parseInt(this.outputs[field],10) !== parseInt(value,10)) {
					this.outputs[field].value = value;
					//this.emit('change', {field: field, value: this.outputs[field].value});
					this.setHardwarePin(field, value);
				}
			}
			else if(this.inputs[field] != undefined) {
				if(parseInt(this.inputs[field], 10) !== parseInt( value, 10 )) {
					this.inputs[field] = value;
					this.emit('change', {field: field, value: this.inputs[field]});
				}
			}
			return this;
		},
		setHardwarePin: function(field, value) {
			var outputField = this.outputs[field];
			if(outputField !== undefined) {
				var pinMode = outputField.pin.mode;

				// Check which pinmode is set on the pin to detemine which method to call
				if (pinMode === this.PINMODES.PWM) {
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
	};
	_.extend(this, johnnyFiveHardwareModel);


	_.extend(this, {
		type: 'ArduinoUno',
		inputs: {
			A0: {pin: {}, value: 0},
			A1: {pin: {}, value: 0},
			A2: {pin: {}, value: 0},
			A3: {pin: {}, value: 0},
			A4: {pin: {}, value: 0},
			A5: {pin: {}, value: 0},
		},
		outputs: {
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
		},
	});

	_.extend(this, attributes);

	return this;
};
