
module.exports = function(options) {
	//var domain = require('domain').create();

	//domain.on('error', function(error) {
		//console.log('domain ERROR!!!', error);
	//});

	//domain.run(function() {

		var deviceType = options.deviceType || 'arduino';

		var modelMap = {
			arduino: './ArduinoModel',
			osc: './OSC',
			galileo2: './GalileoGen2',
		};
		var sensors = [],
			outputs = {};

		var model = require(modelMap[deviceType])();
		model.init();
		this.model = model;

		Hardware = {
			model: model,
		};
	//});


	return Hardware;
}
