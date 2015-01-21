define([
	'models/ArduinoUno',
	'models/OSC',
],
function( ArduinoUnoModel, OSCModel ) {
    'use strict';

	return {
		ArduinoUno: ArduinoUnoModel,
		OSC: OSCModel,
	};
});
