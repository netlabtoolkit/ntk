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
	window.app = App;

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

	var currentVersion;

	$.getJSON('package.json', function(localData) {
		currentVersion = localData.version.split('.');

		console.log('current', currentVersion);

		$.getJSON('https://raw.githubusercontent.com/netlabtoolkit/ntk/master/package.json', function(data) {
			var latestVersion = data.version.split('.');

			var breakLoop = false,
				versionIsCurrent = true,
				i = 0;

			while(i < 3 && !breakLoop) {
				if(parseInt(latestVersion[i], 10) > parseInt(currentVersion[i],10)) {
					breakLoop = true;
					versionIsCurrent = false;
				}
				else if(parseInt(latestVersion[i], 10) !== parseInt(currentVersion[i],10) ) {
					breakLoop = true;
					versionIsCurrent = true;
				}

				i++;
			}

			console.log('versionIsCurrent', versionIsCurrent);
			if(versionIsCurrent) {
				$('.settings').append('<div class="version">v'+localData.version+'</div>');
			}
			else {
				$('.settings').append('<div class="version"><a href="http://www.netlabtoolkit.org/download/" TARGET="_BLANK">UPDATE AVAILABLE</a></div>');
			}
		});
	});

	return App;
});
