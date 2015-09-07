define([
	'backbone',
	'text!tmpl/RestrictiveOverlay_tmpl.js'
],
function( Backbone, Template  ) {
    'use strict';

	return Backbone.View.extend({
		events: {
			'click': 'showMessage',
		},
		subViews: [],
    	template: _.template(Template),
		className: 'restrictiveOverlay',

		render: function() {
			this.el.innerHTML = this.template();

			return this;
		},
		showMessage: function showMessage(e) {
			e.stopPropagation();
			e.preventDefault();

			this.$('.message')
			.css({top: e.pageY - 20, left: e.pageX + 20})
			.animate({opacity: 1}, {
				duration: 500,
				complete: function() {
					$(this).animate({opacity: 0}, 500);
				}
			});
		},
	});

});
