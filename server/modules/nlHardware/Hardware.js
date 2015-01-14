
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
		model.init();
		this.model = model;

		Hardware = {
			model: model,
		};
	//});

	//domain.on('error', function(error) {
		//console.log('domain ERROR!!!', error);
	//});

	return Hardware;
}
