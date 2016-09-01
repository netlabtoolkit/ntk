
module.exports = function(attributes) {

	var _ = require('underscore'),
		five = require("johnny-five"),
		events = require('events'),
		standardFirmataModel = require("StandardFirmataModel"),
		pollIntervalMod = 1,
		self;


		var constructor = function() {
			this.type = "ArduinoUno";

			var self = this;
			this.board = five.Board({
				repl:false
			});


			this.board.on("ready", function() {
				self.connected = true;
				this.addDefaultPins();
			}.bind(this));

			this.board.on('error', function(err) {
				console.log(err);
			});

		};

	// Load in the Standard Firmata model
	_.extend(constructor.prototype, standardFirmataModel);

	// Add event handling
	events.EventEmitter.call(constructor.prototype);
	_.extend(constructor.prototype, events.EventEmitter.prototype);


	// Add any attributes that were passed in
	_.extend(constructor.prototype, attributes);

	var newObj = new constructor();
	return newObj;
};
