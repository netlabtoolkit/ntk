define([
	'backbone',
	'text!tmpl/RestrictiveOverlay_tmpl.js'
],
function( Backbone, Template  ) {
    'use strict';

	return Backbone.View.extend({
		events: {
			'mousedown': 'showMessage',
		},
		subViews: [],
    	template: _.template(Template),
		className: 'restrictiveOverlay',

		initialize: function() {
			this.addEventListeners();
		},
		render: function() {
			this.el.innerHTML = this.template();

			return this;
		},
		addEventListeners: function addEventListeners() {
			window.app.on('RestrictiveOverlay:hide', this.hide, this);
			window.app.on('RestrictiveOverlay:show', this.show, this);
			window.app.on('RestrictiveOverlay:showMessage', this.showMessage, this);
		},
		show: function show() {
			this.setTopZIndex();
			this.$el.show();
		},
		hide: function hide() {
			this.$el.hide();
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
		setTopZIndex: function setTopZIndex() {
			var topZIndex = 0;

			$('.widget').each(function() {
				var index = parseInt($(this).css('z-index'), 10);
				if(index > topZIndex) {
					topZIndex = index;
				}
			});

			this.$el.css('z-index', topZIndex);
			$('#toolBarRegion').css('z-index', topZIndex+10);
		},
	});

});
