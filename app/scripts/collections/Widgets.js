define([
	'backbone',
	'models/Widget',
],
function( Backbone, WidgetModel ) {
    'use strict';

	/* Return a collection class definition */
	return Backbone.Collection.extend({
		initialize: function() {
			console.log("initialize a Widgets collection");
		},
		model: WidgetModel,
	});
});
