
module.exports = function(attributes) {

	var _ = require('underscore'),
		five = require("johnny-five"),
		events = require('events'),
		self = this,
		pollIntervalMod = 30;

	events.EventEmitter.call(this);
	_.extend(this, events.EventEmitter.prototype);


	// Base HardwareModel class
	var johnnyFiveHardwareModel = {
		init: function() {
			this.board = five.Board({
				repl:false,
			});

			this.board.on("ready", function() {
				self.connected = true;
				addDefaultPins.call(self);
			});
			this.board.on('error', function(err) {
				console.log(err);
			});

			return this;
		},
		setPollSpeed: function(highLow) {
			if(highLow == 'fast') {
				console.log('setting fast');
				pollIntervalMod = 1;
			}
			else {
				console.log('setting slow');
				pollIntervalMod = 30;
			}
		},
		addDefaultPins: function addDefaultPins() {
			// Store all pin mode mappings (string -> integer)
			this.PINMODES = this.board.io.MODES;

			var pollFreq = 100;

			// Instantiate each sensor listed on the model to the sensors array
			for(var input in this.inputs) {

				(function() {
					if(!parseInt(input, 10)) {

						(function() {
							var pinput = input,
								pollInterval = 0;

							this.board.analogRead(input, function(data) {
								pollInterval = (++pollInterval) % pollIntervalMod;
								if(pollInterval === 0) {
									if(self.get(pinput) !== Math.floor(data) ) {
										//if(pinput == "A0") {
											//console.log(data, self.get(pinput) );
										//}
										self.set(pinput, Math.floor(data));
									}
								}
							});
						})();

					}
					else {
						console.log(">>", input);
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
					this.setHardwarePin(field, value);
				}
			}
			else if(this.inputs[field] != undefined) {
				if(parseInt(this.inputs[field], 10) !== parseInt( value, 10 )) {
					this.inputs[field].value = value;
					this.emit('change', {field: field, value: this.inputs[field].value});
				}
			}
			return this;
		},
		setHardwarePin: function(field, value) {
			var outputField = this.outputs[field];

			if(outputField !== undefined && field === 'D3' || field === 'D5' || field === 'D6' || field === 'D9' || field === 'D10' || field === 'D11' || field === 'D11') {
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
