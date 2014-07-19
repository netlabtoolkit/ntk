define([
	'backbone',
	'text!tmpl/Canvas_tmpl.js'
],
function( Backbone, Template  ) {
    'use strict';

	return Backbone.View.extend({
		initialize: function() {
		},
    	template: _.template(Template),
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
