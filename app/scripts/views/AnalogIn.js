define([
	'backbone',
	'rivets',
	'utils/SignalChainFunctions',
	'views/item/Widget',
	'text!tmpl/AnalogIn_tmpl.js',
	'jqueryknob',
],
function(Backbone, rivets, SignalChainFunctions, WidgetView, Template, jqueryknob){
    'use strict';

	return WidgetView.extend({
		className: 'analogIn',
		template: _.template(Template),
		initialize: function(options) {
			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);
			_.extend(this.events, {
				'click .invert': 'toggleInvert',
			});
			this.model.set('title', 'Analog In');

			var self = this;

			window.socketIO.on(this.model.get('inputMapping'), function(value) {
				if(self.sourceModel) {
					self.sourceModel.set(self.model.get('inputMapping'), value);
				}
			});

			this.signalChainFunctions.push(SignalChainFunctions.scale);
			this.signalChainFunctions.push(SignalChainFunctions.invert);
		},

		onRender: function() {
			WidgetView.prototype.onRender.call(this);
			var self = this;
			this.$(".dial").trigger(
		        'configure',
		        {
		        	'change' : function (v) { self.model.set('in', v); }
		        }
    		);

			rivets.binders.knob = function(el, value) {
				el.value = value;
				$(el).val(value);
				$(el).trigger('change');
			};


		},
		toggleInvert: function() {
			this.model.set('invert', !this.model.get('invert'));
		},

	});
});


