define([
	'backbone',
	'views/item/WidgetMulti',
	'text!tmpl/AnalogOut_tmpl.js'

],
function(Backbone, WidgetView, Template){
    'use strict';

	return WidgetView.extend({
		className: 'analogOut',
		template: _.template(Template),

		ins: [
			{title: 'input', name: 'in', fieldMap: 'in'},
		],
		outs: [
			{title: 'output', name: 'in', fieldMap: 'out'},
		],
		initialize: function(options) {
			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);
			this.model.set('title', 'AnalogOut');
		},
	});
});
