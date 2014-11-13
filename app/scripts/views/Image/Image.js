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
		initialize: function(options) {
			WidgetView.prototype.initialize.call(this, options);

			var elementSrc = prompt('Please enter an image URL');
			if(!elementSrc) {
				elementSrc = 'images/pinkBlue.jpg';
			}

			this.model.set({
				src: elementSrc,
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
				opacity: 100,
				top: 100,
			});
		},
        
        onRender: function() {
			WidgetView.prototype.onRender.call(this);
			var self = this;
            this.$('.detachedEl').css( 'cursor', 'move' );
            this.$( ".detachedEl" ).draggable({ cursor: "move" });
		},

	});
});


