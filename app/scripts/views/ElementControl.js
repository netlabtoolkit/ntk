define([
	'backbone',
	'rivets',
	'views/item/Widget',
	'text!tmpl/ElementControl_tmpl.js'
],
function(Backbone, rivets, WidgetView, Template){
    'use strict';

	return WidgetView.extend({
		className: 'elementControl',
		template: _.template(Template),
		initialize: function(options) {
			WidgetView.prototype.initialize.call(this, options);
			this.model.set({
				title: 'Element Control',
				activeControlParameter: 'Y',
				controlParameters: [
					{
						name: 'X',
						parameter: 'left',
					},
					{
						name: 'Y',
						parameter: 'top',
					},
					{
						name: 'opacity',
						parameter: 'opacity',
					},
				],
			});
		},

		onRender: function() {
			WidgetView.prototype.onRender.call(this);

			rivets.binders.opacity = function(el, value) {
				el.style.opacity = value/100;
			};
		}
	});
});


