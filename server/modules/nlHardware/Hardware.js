
module.exports = function(options) {
	//var domain = require('domain').create();

	//domain.on('error', function(error) {
		//console.log('domain ERROR!!!', error);
	//});

	//domain.run(function() {

		var deviceType = options.deviceType || 'ArduinoUno';

		var modelMap = {
			ArduinoUno: './ArduinoModel',
			OSC: './OSC',
			galileo: './Galileo2Model',
			edison: './EdisonModel',
		};
		var sensors = [],
			outputs = {};


		var model = new require(modelMap[deviceType])(options);
		this.model = model;

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
