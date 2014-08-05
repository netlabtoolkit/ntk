define([
	'backbone',
	'models/Hardware',
],
function( Backbone, HardwareModel ) {
    'use strict';

    /**
     * ArduinoUno Model containing Arduino Uno specific properties and defaults
     *
     * @return
     */
	var ArduinoUno = HardwareModel.extend({

		defaults: {
			type: "ArduinoUno",
			A0: 0,
			A1: 0,
			out9: 0,
		},

    });

	return ArduinoUno;
});
