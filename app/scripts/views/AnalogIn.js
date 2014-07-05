define([
	'backbone',
	'views/item/Widget',
	'text!tmpl/AnalogIn_tmpl.js'
],
function(Backbone, WidgetView, Template){
    'use strict';

	return WidgetView.extend({
		className: 'analogIn',
		template: _.template(Template),
		initialize: function(options) {
			// extend and assign with custom options/values
			_.extend(this.config, options);

			var self = this;

			window.io.on(this.config.mappings.in, function(value) {
				if(self.model) {
					self.model.set(self.config.mappings.in, value);
				}

				//self.$el.css(self.config.controlParameter, value * 3);
			});

		},

	});
});


