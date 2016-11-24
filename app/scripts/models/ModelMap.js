define([
	'models/ArduinoUno',
	'models/MKR1000',
	'models/OSC',
],
function( ArduinoUnoModel, MKR1000Model, OSCModel ) {
    'use strict';

	return {
		ArduinoUno: ArduinoUnoModel,
		mkr1000: MKR1000Model,
		OSC: OSCModel,
	};
});
