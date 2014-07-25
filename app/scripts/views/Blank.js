define([
	'backbone',
	'views/item/Widget',
	'text!tmpl/Blank_tmpl.js',

	'utils/SignalChainFunctions',
],
function(Backbone, WidgetView, Template, SignalChainFunctions){
    'use strict';

	return WidgetView.extend({
        // Any custom DOM events should go here
        widgetEvents: {},
		className: 'blank',
		template: _.template(Template),

		initialize: function(options) {
			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);

            // Call any custom DOM events here
			this.model.set('title', 'Blank');

            // If you want to register your own signal processing function, push them to signalChainFunctions
			//this.signalChainFunctions.push(SignalChainFunctions.scale);
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
