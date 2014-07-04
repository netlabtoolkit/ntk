define([
	'backbone',
	'models/Widget',
	'views/AnalogIn',
],
function( Backbone, WidgetModel, WidgetView ) {
    'use strict';

	/* Return a model class definition */
	var ArduinoUno = WidgetModel.extend({
		initialize: function() {
			console.log("initialize a Arduinouno model");
		},
		view: WidgetView,

		defaults: {
			A0: 0,
			A1: 0,
		},

    });

	return ArduinoUno;
});
