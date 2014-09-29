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
		Blank: Blank,
		AnalogIn: AnalogIn,
		AnalogOut: AnalogOut,
		Code: Code,
		ElementControl: ElementControl,
	};
});
