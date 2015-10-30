define([
	'backbone',
    'rivets',
	'views/item/WidgetMulti',
	'text!./template.js',

	'utils/SignalChainFunctions',
	'utils/SignalChainClasses',
],
function(Backbone, rivets, WidgetView, Template, SignalChainFunctions, SignalChainClasses){
    'use strict';

	return WidgetView.extend({
		// Define the inlets
		ins: [
		],
		outs: [
			// title is decorative, from: <widget model field>, to: <widget model field being listened to>
			{title: 'out', from: 'in', to: 'out'},
		],
        // Any custom DOM events should go here (Backbone style)
        widgetEvents: {},
		// typeID us the unique ID for this widget. It must be a unique name as these are global.
		typeID: 'OSCIn',
		className: 'oscIn',
		categories: ['Network'],
		template: _.template(Template),

		initialize: function(options) {
			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);

            // Call any custom DOM events here
			this.model.set('title', 'OSCIn');
		},

	});
});
