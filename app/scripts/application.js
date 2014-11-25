define([
	'backbone',
	'communicator',
	'routers/Main',
	'modules/Patcher',
	'modules/ToolBar',
],

function( Backbone, Communicator, MainRouter, PatcherModule, ToolBarModule) {
    'use strict';


	var App = new Backbone.Marionette.Application();

	// Regions
	App.addRegions({
		patcherRegion: '#patcherRegion',
		toolBarRegion: '#toolBarRegion',
	});


	// Initializers
	App.addInitializer( function () {
		Communicator.mediator.trigger("APP:START");
		App.mainRouter = new MainRouter();
		Backbone.history.start();
		App.module('Patcher', PatcherModule);
		App.module('ToolBar', ToolBarModule);
	});

	return App;
});
