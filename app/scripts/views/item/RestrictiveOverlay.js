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
			// .restrictiveOverlay has no display:none in its own CSS (just
			// a transparent, absolutely-positioned div covering the
			// canvas) - this used to get established via ToolBar.js's
			// initialize() calling indicateServerActive() once at
			// startup, which (via a stale window.app.serverActive read,
			// always undefined) happened to always take its "hide" branch
			// regardless of real server state. Removing that whole method
			// (see the Edit ON/OFF button removal, 2026-09-23) removed
			// this side effect along with it - without it, the overlay
			// sits on top of the canvas from the very first render,
			// silently eating every click (symptom: clicking anything on
			// the canvas flashes the "Change to Edit ON mode" message).
			// Establish it here instead, directly, so this view owns its
			// own default state rather than depending on another view's
			// unrelated method for a side effect.
			this.hide();
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
			.css({top: e.pageY - 20, left: e.pageX - 60})
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

			this.$el.css('z-index', topZIndex + 20);
			//$('#toolBarRegion').css('z-index', topZIndex+10);
		},
	});

});
