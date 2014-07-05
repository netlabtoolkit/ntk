define([
	'backbone',
	'models/Widget',
],
function( Backbone, WidgetModel ) {
    'use strict';

	/* Return a model class definition */
	var ArduinoUno = WidgetModel.extend({

		defaults: {
			A0: 0,
			A1: 0,
		},

    });

	return ArduinoUno;
});
