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
			WidgetView.prototype.initialize.call(this, options);
			this.model.set('title', 'Element Control');
		},
		//onSync: function() {
			//window.socketIO.emit('out9', this.model.get('in'));
		//},
	});
});


