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
			// extend and assign with custom options/values
			_.extend(this.config, options);

			var self = this;

			window.socketIO.on(this.config.mappings.in, function(value) {
				if(self.model) {
					self.model.set(self.config.mappings.in, value);
				}

				//self.$el.css(self.config.controlParameter, value * 3);
				self.$('.element').css('left', (value/100) * window.innerWidth);
			});

		},

	});
});


