
module.exports = function(attributes) {
	// Replace this with passed in data
	//var argHostPort = process.argv[3] ? process.argv[3].split(":") : undefined;
	var argHostPort = [attributes.address, attributes.port];
	console.log('CHOSE THE RIGHT ONE)_)_)_)_)_)_)_)_)_)_)', attributes);

	var _ = require('underscore'),
		five = require("johnny-five"),
		net = require("net"),
		firmata = require("firmata"),
		events = require('events'),
		mkrHost = argHostPort !== undefined ? argHostPort[0] : "192.168.1.113",
		mkrPort = argHostPort !== undefined ? parseInt(argHostPort[1],10) : 3030;

	var constructor = function() {
		this.type = "mkr1000";
		var self = this;

		console.log('Connecting to ...', mkrHost, mkrPort);
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

		// Load in the Standard Firmata model
		var standardFirmataModel = require("./StandardFirmataModel")(five);
		_.extend(constructor.prototype, standardFirmataModel);

	};

	// Add event handling
	events.EventEmitter.call(constructor.prototype);
	_.extend(constructor.prototype, events.EventEmitter.prototype);


	// Add any attributes that were passed in
	_.extend(constructor.prototype, attributes);

	var newObj = new constructor();
	return newObj;
};
