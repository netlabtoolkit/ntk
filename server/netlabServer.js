
module.exports = function(options) {
'use strict';

// Create hardware device factory
var deviceType = process.argv[2] || 'ArduinoUno',
	nlHardware = require('./modules/nlHardware/Hardware'),
	socketIO = require('socket.io');

// Some options
var serverPort = 9001;

// The currently selected/attached hardware devices
var deviceControllers = {};
deviceControllers[deviceType] = new nlHardware({deviceType: deviceType}).model;
deviceControllers["OSC"] = new nlHardware({deviceType: "OSC"}).model;

// Create a WEB SERVER then create a transport tied to the webserver
var nlWebServer = new require('./modules/nlWebServer/nlWebServer')({port: serverPort});

nlWebServer.start()
	.then(function(server) {
		var io = socketIO.listen(server),
			serverActivated = true;

		// Passing the deviceControllers model to the clientSync before having the server specific version
		var clientSync = require('./modules/nlMultiClientSync/nlMultiClientSync')({transport: io, models: deviceControllers });

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

		process.stdin.resume();

		// Shut down the child phantomjs process before exit
		childProcess.shutdown = function () {
			console.log("...closing");

			phantomChild.kill()
			process.exit(0);
		};

		process.on("SIGINT", function () {
			childProcess.shutdown();
		});

		var phantomChild = childProcess.execFile(binPath, childArgs, function(err, stdout, stderr) {});

		// Toggle the autonomous server off or on depending on whether it is running
		clientSync.on('toggleServer', function() {
			if(serverActivated) {
				console.log('client takes over, standalone system stopping');
				serverActivated = false;
				phantomChild.kill();
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
				phantomChild = childProcess.execFile(binPath, childArgs);
				clientSync.emit('notify:serverActive', true);
			}
		});
	});

};
