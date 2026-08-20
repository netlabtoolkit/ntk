
module.exports = function(options) {
'use strict';

	return new Promise( (resolve, reject)  => {
// Create hardware device factory
var nlHardware = require('./modules/nlHardware/Hardware'),
	socketIO = require('socket.io');

// Some options
var serverPort = 9001;

// The currently selected/attached hardware devices, instantiated on demand
// per deviceType:address:port key (see nlMultiClientSync.js registerClient)
var deviceControllers = {};

// Create a WEB SERVER then create a transport tied to the webserver
var nlWebServer = new require('./modules/nlWebServer/nlWebServer')({port: serverPort});

nlWebServer.start()
	.then(function(server) {
		var io = socketIO.listen(server);

		// Passing the deviceControllers model to the clientSync before having the server specific version
		var clientSync = require('./modules/nlMultiClientSync/nlMultiClientSync')({transport: io, models: deviceControllers });
		var serverActivated = true;

		// Bind loading a new file directly from the client
		nlWebServer.on('loadPatch', function(options) {
			clientSync.loadPatch(options);
		});

		// Toggle editing control between the autonomous server and this web-based client
		// (drives the "Edit ON"/"Edit OFF" button and the canvas RestrictiveOverlay lock)
		clientSync.on('toggleServer', function() {
			if(serverActivated) {
				console.log('client takes over, standalone system stopping');
				serverActivated = false;
				for(var deviceType in deviceControllers) {
					deviceControllers[deviceType].setPollSpeed('fast');
				}
				clientSync.emit('notify:serverActive', false);
			}
			else {
				console.log('client rescinds control, standalone system starting');
				serverActivated = true;
				for(var deviceType in deviceControllers) {
					deviceControllers[deviceType].setPollSpeed('slow');
				}
				clientSync.emit('notify:serverActive', true);
			}
		});

		resolve();
	})
	.catch((err) => {
		console.log('error:', err);

		resolve();
	});

});
};
