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
			'server': 'setServerClient',
		},

		index: function() {
			//this.renderContainerViews();
		},
		setServerClient: function() {
			app.server = true;
			console.log('setting server');
		},
		renderContainerViews: function() {
			console.log('rendering main', window.app);

			//this.mainCanvas = new CanvasView();
			//app.mainCanvas.show(this.mainCanvas);
		},

	});
});
