

module.exports = function(options) {
    var deviceType = options.deviceType || 'arduino';
    var modelMap = {
        arduino: './ArduinoModel',
    };

    var model = require(modelMap[deviceType])();
    var five = require("johnny-five");
    var board = five.Board();

    var sensors = [];
	board.on("ready", function() {
        var pollFreq = 100;

		// Create a new `sensor` hardware instance.
		sensor = new five.Sensor({
			pin: "A0",
			freq: 100,
		});
		sensor1 = new five.Sensor({
			pin: "A1",
			freq: 100,
		});
		servo = five.Servo({
			pin: 9,
			range: [0,170],
			//range: [0,1023],
		});


        // Instantiate and add each sensor listed on the model to the sensors array
        for(var input in model.inputs) {
            var sensor = new five.sensor({
                pin: input,
                freq: pollFreq,
            });

            sensors.push(sensor);
        }

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
