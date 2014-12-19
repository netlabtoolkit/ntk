define([
	'backbone',
	'rivets',
	'views/item/WidgetMulti',
	'text!./template.js',
],
function(Backbone, rivets, WidgetView, Template){
    'use strict';

	return WidgetView.extend({
		typeID: 'Image',
		className: 'image',
		template: _.template(Template),
		sources: [],
        
        widgetEvents: {
			'mouseup .detachedEl': 'imgMoved',
		},
		initialize: function(options) {
			WidgetView.prototype.initialize.call(this, options);

			this.model.set({
				src: 'assets/images/NTKlogogreen.jpg',
				ins: [
					//{name: 'in', to: 'in'},
					{title: 'X Position', to: 'left'},
					{title: 'Y Position', to: 'top'},
                    {title: 'opacity', to: 'opacity'},
				],
				title: 'Image',
				activeControlParameter: 'left',
				controlParameters: [
					{
						name: 'X',
						parameter: 'left',
					},
					{
						name: 'Y',
						parameter: 'top',
					},
					{
						name: 'opacity',
						parameter: 'opacity',
					},
				],
				left: 100,
                top: 200,
				opacity: 100,
			});
		},
        
        onRender: function() {
			WidgetView.prototype.onRender.call(this);
			var self = this;
            if(!app.server) {
                this.$( '.detachedEl' ).css( 'cursor', 'move' );
                this.$( '.detachedEl' ).css( 'position', 'fixed' );
                this.$( '.detachedEl' ).draggable({ cursor: 'move' });
            }
		},
        
        imgMoved: function(e) {
            var offset = this.$('.detachedEl').offset();
            this.model.set('left',offset.left);
            this.model.set('top',offset.top);
        },

	});
});


