define([
	'models/ArduinoUno',
	'models/Network',
	'models/OSC',
	'models/Cloud',
],
function( ArduinoUnoModel, NetworkModel, OSCModel, CloudModel ) {
    'use strict';

	return {
		ArduinoUno: ArduinoUnoModel,
		network: NetworkModel,
		OSC: OSCModel,
		Cloud: CloudModel,
	};
});
