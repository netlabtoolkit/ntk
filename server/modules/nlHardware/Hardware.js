
module.exports = function(options) {
	//var domain = require('domain').create();

	//domain.on('error', function(error) {
		//console.log('domain ERROR!!!', error);
	//});

	//domain.run(function() {

	if(options === undefined) {
		options = {deviceType: 'ArduinoUno'};
	}

	var deviceType = options.deviceType;
		var modelMap = {
			ArduinoUno: './ArduinoModel',
			OSC: './OSC',
			galileo: './Galileo2Model',
			edison: './EdisonModel',
			mkr1000: './MKR1000Model',
		};
		var sensors = [],
			outputs = {};

		//this.outputs = outputs;


		var deviceTypeParsed = deviceType.split(":");
		deviceTypeParsed = deviceTypeParsed[0];
		options.deviceType = deviceTypeParsed;

		console.log('modelMap chose', deviceTypeParsed, options);

		var model = new require(modelMap[deviceTypeParsed])(options);
		this.model = model;
		this.model.address = deviceType;

		var Hardware = {
			model: model,
			modelType: deviceType,
			setPollSpeed: function(highLow) {
				this.model.setPollSpeed(highLow);
			},

		};
	//});


	return Hardware;
}
