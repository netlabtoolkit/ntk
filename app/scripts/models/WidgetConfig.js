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
			inputMapping: 'A0',
			in: 0,
			out: 0,
		},

    });

	return WidgetConfig;
});
