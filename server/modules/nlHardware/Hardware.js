

module.exports = function(options) {
	//var domain = require('domain').create();

	//domain.run(function() {

		var deviceType = options.deviceType || 'arduino';
		var modelMap = {
			arduino: './ArduinoModel',
		};
		var sensors = [];

		var model = require(modelMap[deviceType])();
		var five = require("johnny-five");
		var board = five.Board();

		console.log('board on');
		board.on("ready", function() {
			var pollFreq = 100;

			// Instantiate each sensor listed on the model to the sensors array
			for(var input in model.inputs) {

				(function() {
				// Set the pin to analog read mode
				//board.pinMode(input, five.Pin.ANALOG);
				//board.pinMode(inp, five.Pin.ANALOG);

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


			// Cycle through and add all the outputs here
			//for(var output in model.outputs) {
				//board.pinMode(output, five.Pin.OUTPUT);
			//}

			//// RESPOND TO input from the USER and set the OUTPUT
			model.on('change', function(options) {
				if(model.outputs[options.field] !== undefined) {
					board.analogWrite(options.field, options.value);
				}
			});


		});

		board.on('error', function(err) {
			console.log(err);
		});
		console.log('board on done');


		Hardware = {
			model: model,
			setTransport: function(transport) {
				this.bindModelToTransport(transport, this.model);
			},
			bindModelToTransport: function(transport, model) {
				this.model.on('change', function(options) {
					//console.log('change and emit', options.field, options.value);
					transport.emit('receivedModelUpdate', {modelType: model.type, field: options.field, value: options.value});
				});
			},

		};
	//});

	//domain.on('error', function(error) {
		//console.log('domain ERROR!!!', error);
	//});

    //return model;
	return Hardware;
}
