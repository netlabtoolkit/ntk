define([
	'backbone',
	'hbs!tmpl/Canvas_tmpl'
],
function( Backbone, CanvasTmpl  ) {
    'use strict';

	return Backbone.View.extend({
		initialize: function() {
		},
    	template: CanvasTmpl,
		className: 'mainCanvas',

		/* Ui events hash */
		events: {
		},

		/* on render callback */
		render: function() {
			this.el.innerHTML = this.template();
			return this;
		},
	});

});
