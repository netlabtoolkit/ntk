
module.exports = function(options) {
	//var domain = require('domain').create();
	//domain.run(function() {

		var deviceType = options.deviceType || 'arduino';
		var modelMap = {
			arduino: './ArduinoModel',
		};
		var sensors = [],
			outputs = {};

		var model = require(modelMap[deviceType])();
		this.model = model;
		var five = require("johnny-five");
		var board = five.Board();

		board.on("ready", function() {
			var pollFreq = 100;

			// Instantiate each sensor listed on the model to the sensors array
			for(var input in model.inputs) {

				(function() {
					if(!parseInt(input, 10)) {
						var sensor = new five.Sensor({
							pin: input,
							//freq: 25,
							freq: 100,
						});

						sensors.push(sensor);
						//board.repl.inject({
						//sensor: sensor
						//});

						var sensorField = input;
						sensor.scale([0, 1023]).on("data", function() {
							model.set(sensorField, Math.floor(this.value));
						});
					}
					else {
						this.pinMode(input, five.Pin.INPUT);
					}

				})();
			}


			// Cycle through and add all the outputs here
			for(var output in model.outputs) {
				(function() {
					// hack for right now to hard code pin 3 as pwm, pin 9 as servo
                    pin = parseInt(output.substr(1),10);
					var outputPin;

					if (pin < 9) {
						outputPin = new five.Led(pin);
					} else {
						outputPin = new five.Servo({
							pin: pin,
							range: [0,180],
						});
					}
					outputs[output] = outputPin;

				})();
			}


			//// RESPOND TO input from the USER and set the OUTPUT
			model.on('change', function(options) {

				if(model.outputs[options.field] !== undefined) {
					var pin = parseInt(options.field.substr(1),10);
					if (pin < 9) {
				        outputs[options.field].brightness(options.value);
					} else {
						outputs[options.field].to(options.value);
					}
				}
			});


		});

		board.on('error', function(err) {
			console.log(err);
		});


		Hardware = {
			model: model,
		};
	//});

	//domain.on('error', function(error) {
		//console.log('domain ERROR!!!', error);
	//});

	return Hardware;
}
