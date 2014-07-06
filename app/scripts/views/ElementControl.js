define([
	'backbone',
	'views/item/Widget',
	'text!tmpl/ElementControl_tmpl.js'
],
function(Backbone, WidgetView, Template){
    'use strict';

	return WidgetView.extend({
		className: 'elementControl',
		template: _.template(Template),
		initialize: function(options) {
			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);

			var self = this;

			window.socketIO.on(this.model.get('inputMapping'), function(value) {
				if(self.model) {
					self.destinationModel.set(self.model.get('inputMapping'), value);
				}
				//self.$el.css(self.config.controlParameter, value * 3);
				self.$('.element').css('left', (value/100) * window.innerWidth);
			});

		},

	});
});


