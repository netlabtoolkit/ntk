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
			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);

			var self = this;

			window.socketIO.on(this.model.get('inputMapping'), function(value) {
				if(self.destinationModel) {
					self.destinationModel.set(self.model.get('inputMapping'), value);
				}
			});

		},

	});
});


