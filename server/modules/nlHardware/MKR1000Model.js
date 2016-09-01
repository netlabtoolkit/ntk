
module.exports = function(attributes) {
	var argHostPort = process.argv[3] ? process.argv[3].split(":") : undefined;

	var _ = require('underscore'),
		five = require("johnny-five"),
		standardFirmataModel = require("StandardFirmataModel"),
		net = require("net"),
		firmata = require("firmata"),
		events = require('events'),
		pollIntervalMod = 1,
		mkrHost = argHostPort !== undefined ? argHostPort[0] : "10.0.1.2",
		mkrPort = argHostPort !== undefined ? parseInt(argHostPort[1],10) : 3030;

	var constructor = function() {
		this.type = "ArduinoUno";
		var self = this;

		var client = net.connect({host: mkrHost, port: mkrPort}, function() {
			var socketClient = this;

			console.log('Connected to MKR1000...');
			var io = new firmata.Board(socketClient);

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
		});

	};

	// Add event handling
	events.EventEmitter.call(constructor.prototype);
	_.extend(constructor.prototype, events.EventEmitter.prototype);

	// Load in the Standard Firmata model
	_.extend(constructor.prototype, standardFirmataModel);

	// Add any attributes that were passed in
	_.extend(constructor.prototype, attributes);

	var newObj = new constructor();
	return newObj;
};
