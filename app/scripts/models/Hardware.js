define([
	'backbone'
],
function( Backbone ) {
    'use strict';

    /**
     * HardwareModel abstract base class for any hardware models that sync with a server
     *
     * @return {Backbone.Model}
     */
	return Backbone.Model.extend({
		initialize: function() {
		},

		defaults: {
		},

    });
});
