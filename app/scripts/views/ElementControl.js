define([
	'backbone',
	'rivets',
	'views/item/Widget',
	'text!tmpl/ElementControl_tmpl.js'
],
function(Backbone, rivets, WidgetView, Template){
    'use strict';

	return WidgetView.extend({
		className: 'elementControl',
		template: _.template(Template),
		initialize: function(options) {
			WidgetView.prototype.initialize.call(this, options);
			this.model.set('title', 'ElementControl');
		},

		onRender: function() {
			WidgetView.prototype.onRender.call(this);

			rivets.binders.opacity = function(el, value) {
				el.style.opacity = value/100;
			};
		}
		//onSync: function() {
			//window.socketIO.emit('out9', this.model.get('in'));
		//},
	});
});


