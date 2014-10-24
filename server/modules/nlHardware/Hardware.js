
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
						// Set the handler for the pin to set the model
						//this.analogRead(input, function(value) {
						//console.log('received input!');
						//model.set(input, Math.floor(value));
						//});
					}
					else {
						this.pinMode(input, five.Pin.INPUT);
					}

				})();
			}


			//board.pinMode(9, five.Pin.OUTPUT);
			// Cycle through and add all the outputs here
			for(var output in model.outputs) {
				(function() {
					// Setting this as an LED temporarily until I figure out Johnny-Five's scheme for analogWrite
					var outputPin = new five.Led(parseInt(output.substr(1),10));
					outputs[output] = outputPin;
				})();

				//y++;
				//board.pinMode(output, five.Pin.OUTPUT);
			}


			//// RESPOND TO input from the USER and set the OUTPUT
			model.on('change', function(options) {
				if(model.outputs[options.field] !== undefined) {
					//board.analogWrite(options.field, options.value);
					// Setting this as an LED temporarily until I figure out Johnny-Five's scheme for analogWrite
					 outputs[options.field].brightness(options.value);
				}
			});


		});

		board.on('error', function(err) {
			console.log(err);
		});


		Hardware = {
			model: model,
			setTransport: function(transport) {
				this.bindModelToTransport(transport, this.model);
			},
			bindModelToTransport: function(transport, model) {
				// Listen for changes made on the hardware to update the front-end
				this.model.on('change', function(options) {
					transport.emit('receivedModelUpdate', {modelType: model.type, field: options.field, value: options.value});
				});

				// Listen for changes from the front-end to update the hardware
				transport.on('connection', function(socket) {
					socket.on('sendModelUpdate', function(options) {
						for(var field in options.model) {
							if(model.outputs[field] !== undefined) {
								model.set(field, parseInt(options.model[field], 10));
							}
						}
					});
				});
			},

		};
	//});

	//domain.on('error', function(error) {
		//console.log('domain ERROR!!!', error);
	//});

	return Hardware;
}
