define([
	'models/ArduinoUno',
	'models/OSC',
],
function( ArduinoUnoModel, OSCModel ) {
    'use strict';

	return {
		ArduinoUno: ArduinoUnoModel,
		MKR1000: ArduinoUnoModel,
		OSC: OSCModel,
	};
});
