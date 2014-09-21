'use strict';

// stop gap to handle when no board is plugged in. Will switch to domain when we setup a proper server
process.on('uncaughtException', function(err) {
	console.log('Caught exception: ' + err);
});

//////////!!!!!!!!!!!!!!!!!!!!!!!
var deviceType = process.argv[2] || 'arduino',
	nlHardware = require('./modules/nlHardware/Hardware');

// The currently selected/attached hardware device
var deviceController = new nlHardware({deviceType: deviceType});

// WEB SERVER
var server = new require('./modules/nlWebServer/nlWebServer')({port: 9001, device: deviceController});
server.start();

