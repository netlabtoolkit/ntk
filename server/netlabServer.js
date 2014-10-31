'use strict';

// stop gap to handle when no board is plugged in. Will switch to domain when we setup a proper server
process.on('uncaughtException', function(err) {
	  console.log('Caught exception on MAIN THREAD: ' + err);
});
/////////////////////////////////

// Create a hardware device
var deviceType = process.argv[2] || 'arduino',
	nlHardware = require('./modules/nlHardware/Hardware'),
	socketIO = require('socket.io');

// The currently selected/attached hardware device
var deviceController = new nlHardware({deviceType: deviceType});

// Create a WEB SERVER then create a transport tied to the webserver
var nlWebServer = new require('./modules/nlWebServer/nlWebServer')({port: 9001, device: deviceController});

nlWebServer.start()
	.then(function(server) {
		var io = socketIO.listen(server);

		// set the transport to the device
		deviceController.setTransport(io);
	});

