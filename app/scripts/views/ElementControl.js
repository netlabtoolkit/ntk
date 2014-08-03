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
		initialize: function(options) {
			window.XX = this;
			WidgetView.prototype.initialize.call(this, options);
			this.model.set({
				ins: [
					//{name: 'in', fieldMap: 'in'},
					{name: 'opacity', fieldMap: 'opacity'},
					{name: 'X', fieldMap: 'left'},
					{name: 'Y', fieldMap: 'top'},
				],
                //outs: [
                    //{title: 'out', name: 'in', fieldMap: 'in'},
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


