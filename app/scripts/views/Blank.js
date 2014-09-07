define([
	'backbone',
	'views/item/WidgetMulti',
	'text!tmpl/Blank_tmpl.js',

	'utils/SignalChainFunctions',
],
function(Backbone, WidgetView, Template, SignalChainFunctions){
    'use strict';

	return WidgetView.extend({
		ins: [
			{title: 'in', to: 'in'},
		],
		outs: [
			// title is decorative, from: <widget model field>, to: <widget model field being listened to>
			{title: 'out', from: 'in', to: 'out'}, 
		],
        // Any custom DOM events should go here
        widgetEvents: {},
		typeID: 'Blank',
		className: 'blank',
		template: _.template(Template),

		initialize: function(options) {
            //console.log(this.ins);
			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);

            // Call any custom DOM events here
			this.model.set('title', 'Blank');

            // If you want to register your own signal processing function, push them to signalChainFunctions
			this.signalChainFunctions.push(this.signalProcess);
		},
        
        signalProcess: function(input) {
            return Number(input);
        },
        /**
         * called when widget is rendered
         *
         * @return {void}
         */
        onRender: function() {
            WidgetView.prototype.onRender.call(this);
        },
        
	});
});
