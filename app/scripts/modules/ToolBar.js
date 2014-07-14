define([
	'application',
	'backbone',
	'controllers/ToolBar',
],
function(app, Backbone, ToolBarController){
    'use strict';

	var ToolBar = function ToolBarConstructor(Patcher, Parent) {

		this.Controller = new ToolBarController(Parent.toolBarRegion);

		this.addInitializer($.proxy(this.Controller.attachMainViews, this.Controller));
	};

	return ToolBar;
});
