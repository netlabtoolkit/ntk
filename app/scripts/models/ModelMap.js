define([
	'models/ArduinoUno',
	'models/Network',
	'models/OSC',
],
function( ArduinoUnoModel, NetworkModel, OSCModel ) {
    'use strict';

	return {
		ArduinoUno: ArduinoUnoModel,
		network: NetworkModel,
		OSC: OSCModel,
	};
});
