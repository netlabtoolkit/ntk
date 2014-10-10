define([
	'views/Blank/Blank',
	'views/AnalogIn',
	'views/AnalogOut',
	'views/Code',
	'views/ElementControl',
    'views/Servo/Servo',
],
function(Blank, AnalogIn, AnalogOut, Code, ElementControl,Servo){
    'use strict';

	return {
		'Blank': Blank,
		'Analog In': AnalogIn,
		'Analog Out': AnalogOut,
		'Code': Code,
		'Element Control': ElementControl,
        'Servo': Servo,
	};
});
