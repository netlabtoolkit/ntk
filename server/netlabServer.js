'use strict';

// stop gap to handle when no board is plugged in. Will switch to domain when we setup a proper server
//process.on('uncaughtException', function(err) {
	  //console.log('Caught exception on MAIN THREAD: ' + err);
//});
/////////////////////////////////

// Create a hardware device
var deviceType = process.argv[2] || 'arduino',
	nlHardware = require('./modules/nlHardware/Hardware'),
	socketIO = require('socket.io');

// Some options
var serverPort = 9001;

// The currently selected/attached hardware device
var deviceController = new nlHardware({deviceType: deviceType});

// Create a WEB SERVER then create a transport tied to the webserver
//var NLWebServer = require('./modules/nlWebServer/nlWebServer');


var nlWebServer = new require('./modules/nlWebServer/nlWebServer')({port: serverPort, device: deviceController});

nlWebServer.start()
	.then(function(server) {
		var io = socketIO.listen(server);

		// Passing the deviceController model to the clientSync before having the server specific version
		var clientSync = require('./modules/nlMultiClientSync/nlMultiClientSync')({transport: io, model: deviceController.model});

		// Bind loading a new file directly from the client
		nlWebServer.on('loadPatch', function(options) {
			clientSync.loadPatch(options);
		});

		var path = require('path'),
			childProcess = require('child_process'),
			phantomjs = require('phantomjs'),
			binPath = phantomjs.path;


		var childArgs = [
			  path.join(__dirname, 'phantomjs/loadClient.js')
		];

		// A helper function to shut down the child.
		childProcess.shutdown = function () {
			// Get rid of the exit listener since this is a planned exit.
			this.removeListener("exit", this.onUnexpectedExit);
			this.kill("SIGTERM");
		};

		process.once("exit", function () {
			//childProcess.shutdown();
		});

		childProcess.execFile(binPath, childArgs, function(err, stdout, stderr) {
		});
	});

