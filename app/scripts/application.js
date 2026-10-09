define([
	'backbone',
	'communicator',
	'routers/Main',
	'modules/Patcher',
	'modules/ToolBar',
	'buildConfig',
],

function( Backbone, Communicator, MainRouter, PatcherModule, ToolBarModule, buildConfig) {
    'use strict';


	var App = new Backbone.Marionette.Application();
	window.app = App;

	// Build-time config (see app/scripts/buildConfig.js). serial:false on
	// Windows/Linux builds and any --no-serial build - the UI drops the
	// "Serial" device option and new widgets default to Network.
	App.buildConfig = buildConfig;

	// Default Device settings, shown in the left-panel Settings drawer -
	// every newly-placed hardware widget (AnalogIn/AnalogOut/DigitalIn/
	// DigitalOut/Servo) picks these up as its own initial Device/ip/port
	// so you don't have to re-enter the network address on every widget.
	// Purely a creation-time default - has no effect on widgets already
	// on the canvas. See ToolBar.js/ToolBar_tmpl.js for the UI and
	// Patcher.js's applyDefaultDeviceToModel/getDefaultDeviceMapping for
	// where it's consumed.
	App.defaultDevice = {
		// Network is the default regardless of buildConfig.serial (Serial
		// is still selectable in the dropdown on builds that have it) -
		// "ntk-device.local" matches settings-example.toml's own default
		// NTK_MDNS_HOSTNAME, so a freshly-set-up board and a fresh NTK
		// install just find each other with no IP-typing required. A
		// board configured with a different NTK_MDNS_HOSTNAME (e.g.
		// running more than one on the same network) overrides this -
		// just type that board's own hostname here instead.
		deviceType: 'network',
		server: 'ntk-device.local',
		port: 3030,
	};

	// Restore the last-saved default (see ToolBar.js's persistDefaultDevice,
	// called whenever the Settings drawer's Device controls change) so the
	// last IP/port entered is still there on the next launch, instead of
	// resetting to the hardcoded fallback above every time. localStorage
	// persists per-origin in Electron's renderer, same as any browser.
	try {
		var savedDefaultDevice = JSON.parse(localStorage.getItem('ntk.defaultDevice'));
		if(savedDefaultDevice) {
			_.extend(App.defaultDevice, savedDefaultDevice);
		}
	}
	catch(e) {
		// Corrupt/missing localStorage entry - just keep the hardcoded default.
	}

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

			if(versionIsCurrent) {
				$('#toolBarRegion .settings').append('<div class="version">v'+localData.version+'</div>');
			}
			else {
				$('#toolBarRegion .settings').append('<div class="version"><a href="http://www.netlabtoolkit.org/download/" TARGET="_BLANK">UPDATE AVAILABLE</a></div>');
			}
		});
	});

	return App;
});
