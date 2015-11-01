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
			{title: 'input', to: 'in'},
		],
		outs: [
			{title: 'output', from: 'in', to: 'out'},
		],
        // Any custom DOM events should go here (Backbone style)
        widgetEvents: {},
		// typeID us the unique ID for this widget. It must be a unique name as these are global.
		typeID: 'OSCOut',
		className: 'oscOut',
		categories: ['Network'],
		template: _.template(Template),

		initialize: function(options) {
			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);

			console.log(options.outputMapping);
            // Call any custom DOM events here
			this.model.set({
				title: 'OSCOut',
				outputMapping: options.outputMapping,
                activeOut: true,
			});

			this.model.on('change', this.processSignalChain, this);
		},
        onRender: function() {
			// always call the superclass
            WidgetView.prototype.onRender.call(this);

            this.$('.dial').knob({
				'fgColor':'#000000',
				'bgColor':'#ffffff',
				'inputColor' : '#000000',
				'angleOffset':-125,
				'angleArc':250,
				'width':80,
				'height':62,
				'font':"'Helvetica Neue', sans-serif",
				'displayInput':false,
				'min': 0,
				'max': 255,
				'change' : function (v) { this.model.set('in', parseInt(v)); }.bind(this)
			});

			rivets.binders.knob = function(el, value) {
				el.value = value;
				$(el).val(value);
				$(el).trigger('change');
			};
        },

		onModelChange: function(model) {
			for(var i=this.sources.length-1; i>=0; i--) {
				this.syncWithSource(this.sources[i].model);
			}
		},

	});
});
