define([
	'backbone',
	'views/item/Widget',
	'text!tmpl/Widgets_tmpl.js'
],
function( Backbone, Widget, Template  ) {
    'use strict';

	return Backbone.View.extend({
		events: {},
		subViews: [],
    	template: _.template(Template),
		className: 'widgets',

		initialize: function() {
			this.i = 0;
		},
		render: function() {
			this.el.innerHTML = this.template();

			this.renderSubViews();
		},
        /**
         * render all sub views in the subViews array
         *
         * @return {void}
         */
		renderSubViews: function() {

			var subViews = this.subViews;

			for(var i=subViews.length-1; i >=0; i--) {
				this.el.appendChild(subViews[i].render().el);
			}
		},
        /**
         * add a sub view to this element and store it in the subViews array
         *
         * @param {Backbone.View} view
         * @return {Backbone.View} this view
         */
		addView: function(view) {
			console.log(view);
			this.subViews.push(view);
			this.el.appendChild(view.render().el);

			return this;
		},
	});

});
