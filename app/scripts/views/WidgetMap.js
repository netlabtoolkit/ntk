define([

	'views/AnalogIn/AnalogIn',
    'views/CloudIn/CloudIn',
    'views/Knob/Knob',
    'views/Button/Button',
    'views/Keyboard/Keyboard',
    'views/Pulse/Pulse',

    'views/Code/Code',
    'views/Process/Process',
    'views/Count/Count',
    'views/IfThen/IfThen',
    'views/Boolean/Boolean',
    'views/Gate/Gate',
    'views/Mix/Mix',
    'views/Splitter/Splitter',
    'views/Data/Data',
    'views/Animate/Animate',
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
function(AnalogIn, CloudIn, Knob, Button, Keyboard, Pulse, Code, Process, Count, IfThen, Boolean, Gate, Mix, Splitter, Data, Animate, Blank, Image, Audio, Video, Text, AnalogOut, Servo, CloudOut, OSCIn){
    'use strict';

	return {
		'AnalogIn': AnalogIn,
		'CloudIn': CloudIn,
		'Knob': Knob,
		'Button': Button,
        'Keyboard': Keyboard,
        'Pulse': Pulse,

		'Code': Code,
        'Process': Process,
        'Count': Count,
        'IfThen': IfThen,
        'Boolean': Boolean,
        'Gate': Gate,
        'Mix': Mix,
		'Splitter': Splitter,
        'Data': Data,
        'Animate': Animate,
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
