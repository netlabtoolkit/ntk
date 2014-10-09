

module.exports = function(options) {
	var domain = require('domain').create();

	domain.run(function() {

		var deviceType = options.deviceType || 'arduino';
		var modelMap = {
			arduino: './ArduinoModel',
		};

		var model = require(modelMap[deviceType])();
		var five = require("johnny-five");
		var board = five.Board();

		//var sensors = [];
		console.log('board on');
		board.on("ready", function() {
			var pollFreq = 100;

			// Instantiate and add each sensor listed on the model to the sensors array
			for(var input in model.inputs) {

				// Set the pin to analog read mode
				this.pinMode(input, five.Pin.ANALOG);

				// Set the handler for the pin to set the model
				this.analogRead(input, function(value) {
					model.set(input, Math.floor(value));
				});

				//sensors.push(sensor);
			}


			// Cycle through and add all the outputs here
			for(var output in model.outputs) {
				board.pinMode(output, five.Pin.OUTPUT);
			}

			// RESPOND TO input from the USER and set the OUTPUT
			model.on('change', function(options) {
				if(model.outputs[options.field] !== undefined) {
					board.analogWrite(options.field, options.value);
					//servo.to(options.value);
				}
			});


		});
		console.log('board on done');


		Hardware = {
			model: model,
			setTransport: function(transport) {
				this.bindModelToTransport(transport, this.model);
			},
			bindModelToTransport: function(transport, model) {
				this.model.on('change', function(options) {
					transport.emit('receivedModelUpdate', {modelType: model.type, field: options.field, value: options.value});
				});
			},

		};
	});

	domain.on('error', function(error) {
		console.log('domain ERROR!!!', error);
	});

    //return model;
	return Hardware;
}
