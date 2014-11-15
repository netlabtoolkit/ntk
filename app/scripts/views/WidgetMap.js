define([
	'views/Blank/Blank',
	'views/AnalogIn/AnalogIn',
	'views/AnalogOut/AnalogOut',
	'views/Code/Code',
	'views/Image/Image',
    'views/Servo/Servo',
    'views/CloudOut/CloudOut',
    'views/Splitter/Splitter',
],
function(Blank, AnalogIn, AnalogOut, Code, Image, Servo, CloudOut, Splitter){
    'use strict';

	return {
		'Blank': Blank,
		'AnalogIn': AnalogIn,
		'AnalogOut': AnalogOut,
		'Code': Code,
		'Image': Image,
        'Servo': Servo,
        'CloudOut': CloudOut,
        'Splitter': Splitter,
	};
});
