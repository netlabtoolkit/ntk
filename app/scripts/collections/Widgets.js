define([
	'backbone',
	'models/WidgetConfig',
],
function( Backbone, WidgetModel ) {
    'use strict';

	return Backbone.Collection.extend({
		//url: '/test',
		initialize: function() {
		},
		model: WidgetModel,
	});
});
