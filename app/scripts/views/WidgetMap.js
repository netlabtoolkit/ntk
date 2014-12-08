define([

	'views/AnalogIn/AnalogIn',
    'views/CloudIn/CloudIn',
    'views/Knob/Knob',
    'views/Button/Button',

    'views/Code/Code',
    'views/Splitter/Splitter',
	'views/Blank/Blank',
    
    'views/Image/Image',
    'views/Audio/Audio',
    'views/Video/Video',
    
	'views/AnalogOut/AnalogOut',
    'views/Servo/Servo',
    'views/CloudOut/CloudOut',

],
function(AnalogIn, CloudIn, Knob, Button, Code, Splitter, Blank, Image, Audio, Video, AnalogOut, Servo, CloudOut){
    'use strict';

	return {
		'AnalogIn': AnalogIn,
        'CloudIn': CloudIn,
        'Knob': Knob,
        'Button': Button,
        
		'Code': Code,
        'Splitter': Splitter,
        'Blank': Blank,
        
		'Image': Image,
        'Audio': Audio,
        'Video': Video,
        
        'AnalogOut': AnalogOut,
        'Servo': Servo,
        'CloudOut': CloudOut,
        

	};
});
