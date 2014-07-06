define([
	'backbone',
	'models/Destination',
],
function( Backbone, DestinationModel ) {
    'use strict';

    /**
     * ArduinoUno Model containing Arduino Uno specific properties and defaults
     *
     * @return
     */
	var ArduinoUno = DestinationModel.extend({

		defaults: {
			A0: 0,
			A1: 0,
		},

    });

	return ArduinoUno;
});
