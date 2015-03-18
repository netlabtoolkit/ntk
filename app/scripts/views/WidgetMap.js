define([

	'views/AnalogIn/AnalogIn',
    'views/CloudIn/CloudIn',
    'views/Knob/Knob',
    'views/Button/Button',

    'views/Code/Code',
    'views/IfThen/IfThen',
    'views/Splitter/Splitter',
	'views/Blank/Blank',
    
    'views/Image/Image',
    'views/Audio/Audio',
    'views/Video/Video',
    
	'views/AnalogOut/AnalogOut',
    'views/Servo/Servo',
    'views/CloudOut/CloudOut',

    'views/OSCIn/OSCIn',
],
function(AnalogIn, CloudIn, Knob, Button, Code, IfThen, Splitter, Blank, Image, Audio, Video, AnalogOut, Servo, CloudOut, OSCIn){
    'use strict';

	return {
		'AnalogIn': AnalogIn,
		'CloudIn': CloudIn,
		'Knob': Knob,
		'Button': Button,

		'Code': Code,
        'IfThen': IfThen,
		'Splitter': Splitter,
		'Blank': Blank,

		'Image': Image,
		'Audio': Audio,
		'Video': Video,

		'AnalogOut': AnalogOut,
		'Servo': Servo,
		'CloudOut': CloudOut,

		//'OSCIn': OSCIn,

	};
});
