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
			this.config = options;

			var self = this;
			window.io.on('A0', function(value) {
				self.model.set('A0', value);

				self.$el.css(self.config.controlParameter, value * 3);
			});


		},

	});
});


