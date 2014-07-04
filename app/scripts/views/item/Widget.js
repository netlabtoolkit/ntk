define([
	'backbone',
	'rivets',
	'text!tmpl/item/Widget_tmpl.js'
],
function( Backbone, rivets, WidgetTmpl  ) {
    'use strict';

	/* Return a ItemView class definition */
	return Backbone.Marionette.ItemView.extend({

		initialize: function() {
			console.log("initialize a Widget ItemView");
			//window.io.on('A0', $.proxy(this.setAnalog,this));
			var self = this;
			//window.io.on('A0', function(value) {
				//console.log('hello', value, self.model);
				//if(self.model){
					//self.model.set('A0', value);
				//}
			//});
		},

		className: 'widget',
		template: _.template( WidgetTmpl ),

    	/* ui selector cache */
    	ui: {},

		/* Ui events hash */
		events: {},

		/* on render callback */
		onRender: function() {
			rivets.binders.color = function(el, value) {
				el.style.color = 'rgb(' + (parseInt( value, 10 )*2 + 55)+ ',0,255)';
			};

			rivets.bind(this.$el, {hw: this.model});
			//this.listenTo(this.model, 'change', this.sendMessage);
		},

	});

});
