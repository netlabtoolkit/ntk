define([
	'application',
	'backbone',
	'views/ToolBar',
],
function(app, Backbone, ToolBarView){

	var ToolBarController = function(region) {
		this.parentRegion = region;
		this.views.main = new ToolBarView();
	};

	ToolBarController.prototype = {
		views: {},
		/**
		 * Add the main view to the parent region
		 *
		 * @return
		 */
		attachMainViews: function() {
			this.parentRegion.show(this.views.main);
			console.log('adding toolbar');
		},
	};

	return ToolBarController;
});
