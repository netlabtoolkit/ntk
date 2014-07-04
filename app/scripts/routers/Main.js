define([
	'backbone',
	'views/item/Canvas',
	'application',
],
function(Backbone, CanvasView){
    'use strict';

	return Backbone.Router.extend({
		/* Backbone routes hash */
		routes: {
			'': 'index',
		},

		index: function() {
			//this.renderContainerViews();
		},
		renderContainerViews: function() {
			console.log('rendering main', window.app);

			//this.mainCanvas = new CanvasView();
			//app.mainCanvas.show(this.mainCanvas);
		},

	});
});
