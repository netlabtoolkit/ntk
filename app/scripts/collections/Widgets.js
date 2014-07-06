define([
	'backbone',
	'models/WidgetConfig',
],
function( Backbone, WidgetModel ) {
    'use strict';

	return Backbone.Collection.extend({
		initialize: function() {
			console.log("initialize a Widgets collection");
		},
		model: WidgetModel,
	});
});
