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
			this.model.set('title', 'Analog In');

			var self = this;

			window.socketIO.on(this.model.get('inputMapping'), function(value) {
				//if(self.sourceModel && self.model.get('active')) {
				if(self.sourceModel) {
					self.sourceModel.set(self.model.get('inputMapping'), value);
				}
			});

		},

	});
});


