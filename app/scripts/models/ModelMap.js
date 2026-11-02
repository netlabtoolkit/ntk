define([
	'models/ArduinoUno',
	'models/Network',
	'models/OSC',
	'models/Cloud',
	'models/WiThrottle',
],
function( ArduinoUnoModel, NetworkModel, OSCModel, CloudModel, WiThrottleModel ) {
    'use strict';

	return {
		ArduinoUno: ArduinoUnoModel,
		network: NetworkModel,
		OSC: OSCModel,
		Cloud: CloudModel,
		WiThrottle: WiThrottleModel,
	};
});
