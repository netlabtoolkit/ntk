define([
	'backbone',
	'rivets',
	'text!tmpl/item/Widget_tmpl.js'
],
function( Backbone, rivets, WidgetTmpl  ) {
    'use strict';

	/* Return a ItemView class definition */
	return Backbone.Marionette.ItemView.extend({
		events: {},
		config: {
			server: 'http://localhost',
			smoothing: false,
			ease: false,
			mappings: {
				in: 'A0',
				out: '13',
			}
		},

		className: 'widget',
		template: _.template( WidgetTmpl ),

		initialize: function() {
			//window.io.on('A0', $.proxy(this.setAnalog,this));
			var self = this;
			//window.io.on('A0', function(value) {
				//console.log('hello', value, self.model);
				//if(self.model){
					//self.model.set('A0', value);
				//}
			//});
		},
		onRender: function() {
			rivets.binders.color = function(el, value) {
				el.style.color = 'rgb(' + (parseInt( value, 10 )*2 + 55)+ ',0,255)';
			};

			if(this.model) {
				rivets.bind(this.$el, {hw: this.model});
				//this.listenTo(this.model, 'change', this.sendMessage);
			}

			this.$el.drags();
		},

	});

});
