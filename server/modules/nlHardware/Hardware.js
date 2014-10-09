

module.exports = function(options) {
    var deviceType = options.deviceType || 'arduino';
    var modelMap = {
        arduino: './ArduinoModel',
    };

    var model = require(modelMap[deviceType])();
    var five = require("johnny-five");
    var board = five.Board();

    //var sensors = [];
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
			if(options.field === 'out9') {
				servo.to(options.value);
			}
		});

		//board.repl.inject({
			//sensor: sensor
		//});

        //io.on('connection', function(socket){
			//console.log('a user connected');

			//// Create the arduino uno instance
			//var arduinoModel = new ArduinoUnoModel();
			//arduinoModel.on('change', function(options) {
				//if(options.field !== 'out9') {
					//socket.emit('receivedModelUpdate', {modelType: 'ArduinoUno', field: options.field, value: options.value});
				//}
			//});

			//var hardwareModels = {
				//ArduinoUno: arduinoModel,
			//};


			//socket.on('sendModelUpdate', function(options) {
				//hardwareModels[options.modelType].set('out9', parseInt(options.model.out9, 10));
			//});
			//arduinoModel.on('change', function(options) {
				//if(options.field === 'out9') {
					//servo.to(options.value);
				//}
			//});

			//sensor.scale([0, 1023]).on("data", function() {
				//arduinoModel.set('A0', Math.floor(this.value));
			//});
			//sensor1.scale([0, 1023]).on("data", function() {
				//arduinoModel.set('A1', Math.floor(this.value));
			//});

		//});
	});

    return model;
}
