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
			inputMapping: null,
			outputMapping: null,
			in: 0,
			out: 0,
		},

    });

	return WidgetConfig;
});
