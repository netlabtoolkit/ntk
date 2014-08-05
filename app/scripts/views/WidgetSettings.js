define([
	'backbone',
	'rivets',
	'text!tmpl/item/Widget_tmpl.js',
	'jqueryui',
	'jquerytouchpunch',
],
function( Backbone, rivets, WidgetTmpl, jqueryui, jquerytouchpunch  ) {
    'use strict';

    /**
     * Widget settings view base class
     *
     * @return {Backbone.Marionette.ItemView}
     */
	return Backbone.Marionette.ItemView.extend({

		className: 'widgetSettings',
		template: _.template( WidgetTmpl ),

		initialize: function(options) {
		},
		onRender: function() {
			rivets.bind(this.$el, {widget: this.model});

			this.$el.draggable({handle: '.dragHandle'});
		},

	});

});
