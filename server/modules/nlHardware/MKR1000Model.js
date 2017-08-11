
module.exports = function(attributes) {
	var argHostPort = [attributes.address, attributes.port];

	var EtherPortClient = require("etherport-client").EtherPortClient;

	var _ = require('underscore'),
		five = require("johnny-five"),
		net = require("net"),
		firmata = require("firmata"),
		events = require('events'),
		mkrHost = argHostPort !== undefined ? argHostPort[0] : "192.168.1.113", // This default is based on the default in StandardFirmataWifi
		mkrPort = argHostPort !== undefined ? parseInt(argHostPort[1],10) : 3030;

	var constructor = function() {
		this.type = "mkr1000";
		//this.type = "ArduinoUno";
		var self = this;

		// Load in the Standard Firmata model
		var standardFirmataModel = require("./StandardFirmataModel")(five);
		_.extend(constructor.prototype, standardFirmataModel);

		console.log('Connecting to ...', mkrHost, mkrPort);
		//var client = net.connect({host: mkrHost, port: mkrPort}, function() {
			//var socketClient = this;

			//var io = new firmata.Board(socketClient);
			var io = new firmata.Board(new EtherPortClient({
				host: mkrHost,
				port: mkrPort
			}));

			io.once('ready', function() {
				self.board = five.Board({
					io: io,
					repl: false,
				});

				self.board.on("ready", function() {
					self.connected = true;
					self.addDefaultPins.call(self);
				});
				self.board.on('error', function(err) {
					console.log(err);
				});
			});
		//});


	};

	// Add event handling
	events.EventEmitter.call(constructor.prototype);
	_.extend(constructor.prototype, events.EventEmitter.prototype);


	// Add any attributes that were passed in
	_.extend(constructor.prototype, attributes);

	var newObj = new constructor();
	return newObj;
};
