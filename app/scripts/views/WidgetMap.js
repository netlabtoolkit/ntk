define([
	'views/Blank/Blank',
	'views/AnalogIn',
	'views/AnalogOut',
	'views/Code',
	'views/ElementControl',
    'views/Servo/Servo',
    'views/CloudOut/CloudOut',
],
function(Blank, AnalogIn, AnalogOut, Code, ElementControl,Servo,CloudOut){
    'use strict';

	return {
		'Blank': Blank,
		'Analog In': AnalogIn,
		'Analog Out': AnalogOut,
		'Code': Code,
		'Element Control': ElementControl,
        'Servo': Servo,
        'CloudOut': CloudOut,
	};
});
