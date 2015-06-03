define([

	'views/AnalogIn/AnalogIn',
    'views/CloudIn/CloudIn',
    'views/Knob/Knob',
    'views/Button/Button',
    'views/Keyboard/Keyboard',

    'views/Code/Code',
    'views/Count/Count',
    'views/IfThen/IfThen',
    'views/Boolean/Boolean',
    'views/Gate/Gate',
    'views/Mix/Mix',
    'views/Splitter/Splitter',
    'views/Data/Data',
	'views/Blank/Blank',
    
    'views/Image/Image',
    'views/Audio/Audio',
    'views/Video/Video',
    'views/Text/Text',
    
	'views/AnalogOut/AnalogOut',
    'views/Servo/Servo',
    'views/CloudOut/CloudOut',

    'views/OSCIn/OSCIn',
],
function(AnalogIn, CloudIn, Knob, Button, Keyboard, Code, Count, IfThen, Boolean, Gate, Mix, Splitter, Data, Blank, Image, Audio, Video, Text, AnalogOut, Servo, CloudOut, OSCIn){
    'use strict';

	return {
		'AnalogIn': AnalogIn,
		'CloudIn': CloudIn,
		'Knob': Knob,
		'Button': Button,
        'Keyboard': Keyboard,

		'Code': Code,
        'Count': Count,
        'IfThen': IfThen,
        'Boolean': Boolean,
        'Gate': Gate,
        'Mix': Mix,
		'Splitter': Splitter,
        'Data': Data,
		'Blank': Blank,

		'Image': Image,
		'Audio': Audio,
		'Video': Video,
        'Text': Text,

		'AnalogOut': AnalogOut,
		'Servo': Servo,
		'CloudOut': CloudOut,

		//'OSCIn': OSCIn,

	};
});
