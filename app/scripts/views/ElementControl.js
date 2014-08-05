define([
	'backbone',
	'rivets',
	'views/item/WidgetMulti',
	'text!tmpl/ElementControl_tmpl.js'
],
function(Backbone, rivets, WidgetView, Template){
    'use strict';

	return WidgetView.extend({
		className: 'elementControl',
		template: _.template(Template),
		sources: [],
		initialize: function(options) {
			window.XX = this;
			WidgetView.prototype.initialize.call(this, options);
			this.model.set({
				ins: [
					//{name: 'in', to: 'in'},
					{title: 'opacity', from: 'opacity', to: 'opacity'},
					{title: 'X Position', from: 'X', to: 'left'},
					{title: 'Y Position', from: 'Y', to: 'top'},
				],
                //outs: [
                    //{title: 'out', name: 'in', to: 'in'},
                //],
				title: 'Element Control',
				activeControlParameter: 'left',
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
				left: 0,
				opacity: 0,
				top: 50,
			});
		},

	});
});


