define([
	'backbone'
],
function( Backbone ) {
    'use strict';

    /**
     *
     *
     * @return
     */
	var WidgetConfig = Backbone.Model.extend({
		initialize: function() {
		},

		defaults: {
			active: true,
			smoothing: false,
			easing: false,
			inputMapping: 'out',
			outputMapping: 'out9',
			in: 0,
			out: 0,
			inputFloor: 0,
			outputFloor: 0,
			inputCeiling: 1023,
			outputCeiling: 1023,
			invert: false,
		},

    });

	return WidgetConfig;
});
