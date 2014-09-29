define([
	'views/Blank/Blank',
	'views/AnalogIn',
	'views/AnalogOut',
	'views/Code',
	'views/ElementControl',
],
function(Blank, AnalogIn, AnalogOut, Code, ElementControl){
    'use strict';

	return {
		'Blank': Blank,
		'Analog In': AnalogIn,
		'Analog Out': AnalogOut,
		'Code': Code,
		'Element Control': ElementControl,
	};
});
