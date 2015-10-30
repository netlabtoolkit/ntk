define([

	'views/AnalogIn/AnalogIn',
    'views/CloudIn/CloudIn',
    'views/Knob/Knob',
    'views/Button/Button',
    'views/Keyboard/Keyboard',
    'views/HTML/HTML',
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
    'views/Tween/Tween',
    'views/Sequence/Sequence',
	'views/Blank/Blank',
    
    'views/Image/Image',
    'views/Audio/Audio',
    'views/Video/Video',
    'views/Text/Text',
    
	'views/AnalogOut/AnalogOut',
    'views/Servo/Servo',
    'views/CloudOut/CloudOut',
    'views/Webhook/Webhook',

    'views/OSCIn/OSCIn',
],
function(AnalogIn, CloudIn, Knob, Button, Keyboard, HTML, Pulse, Code, Process, Count, IfThen, Boolean, Gate, Mix, Splitter, Data, Tween, Sequence, Blank, Image, Audio, Video, Text, AnalogOut, Servo, CloudOut, Webhook, OSCIn){
    'use strict';

	return {
		'AnalogIn': AnalogIn,
		'CloudIn': CloudIn,
		'Knob': Knob,
		'Button': Button,
        'Keyboard': Keyboard,
        'HTML': HTML,
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
        'Tween': Tween,
        'Sequence': Sequence,
		'Blank': Blank,

		'Image': Image,
		'Audio': Audio,
		'Video': Video,
        'Text': Text,

		'AnalogOut': AnalogOut,
		'Servo': Servo,
		'CloudOut': CloudOut,
        'Webhook': Webhook,

		'OSCIn': OSCIn,

	};
});
