define([
	'backbone',
    'rivets',
	'views/item/WidgetMulti',
	'text!./template.js',
    'jqueryknob',

],
function(Backbone, rivets, WidgetView, Template, jqueryknob){
	'use strict';

	return WidgetView.extend({
		typeID: 'OSCOut',
		deviceMode: 'PWM',
		categories: ['Network'],
		className: 'oscOut',
		template: _.template(Template),

		ins: [
			{title: 'input', to: 'in'},
		],
		outs: [
			{title: 'output', from: 'in', to: 'out'},
		],
		sources: [],
		initialize: function(options) {
			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);
			this.model.set({
				title: 'OSCOut',
                port: 57120,
				outputMapping: options.outputMapping,
                activeOut: true,
			});

            this.signalChainFunctions.push(this.limitRange);

			// This is here because this widget effectively does not output (only outputs to hardware and then, only on server)
			// So we go ahead and process so the output can be shown in the widget
			this.model.on('change', this.processSignalChain, this);

			// SGC: OK, small hack for async issues
			window.setTimeout(function() {
				window.app.vent.trigger('Widget:hardwareSwitch', {deviceType: 'OSC', port: this.model.get('outputMapping') });
			}.bind(this), 200);
		},

		onModelChange: function(model) {
			for(var i=this.sources.length-1; i>=0; i--) {
				this.syncWithSource(this.sources[i].model);
			}
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
				'max': 1023,
				'change' : function (v) { this.model.set('in', parseInt(v)); }.bind(this)
			});

			rivets.binders.knob = function(el, value) {
				el.value = value;
				$(el).val(value);
				$(el).trigger('change');
			};
        },

        limitRange: function(input) {
            var output = input;
            output = Math.max(output, 0);
            output = Math.min(output, 1023);
            return Number(output);
        },
	});
});
