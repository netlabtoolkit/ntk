
module.exports = function(attributes) {
	var argHostPort = [attributes.address, attributes.port];

	var EtherPortClient = require("etherport-client").EtherPortClient;

	var _ = require('underscore'),
		five = require("johnny-five"),
		net = require("net"),
		firmata = require("firmata"),
		events = require('events'),
		networkHost = argHostPort !== undefined ? argHostPort[0] : "192.168.1.113", // This default is based on the default in StandardFirmataWifi
		networkPort = argHostPort !== undefined ? parseInt(argHostPort[1],10) : 3030;

	var constructor = function() {
		this.type = "network";
		var self = this;

		// Load in the Standard Firmata model
		var standardFirmataModel = require("./StandardFirmataModel")(five);
		_.extend(constructor.prototype, standardFirmataModel);

		console.log('Connecting to ...', networkHost, networkPort);
		//var client = net.connect({host: networkHost, port: networkPort}, function() {
			//var socketClient = this;

			//var io = new firmata.Board(socketClient);
			var etherPortClient = new EtherPortClient({
				host: networkHost,
				port: networkPort
			});

			// nlMultiClientSync.js calls this (if present) when no widget
			// references this device any more. etherport-client exposes no
			// public teardown of its own (see server/node_modules/
			// etherport-client/index.js) - every socket 'close'/'error'/
			// 'timeout' event calls its internal _reconnect(), forever, with
			// no way to opt out via its public API. Without this, the
			// connection (and its reconnect loop) outlived every widget that
			// ever referenced it for the lifetime of the server process.
			self.close = function() {
				self.connected = false;

				// Stop the johnny-five Sensor poll timers that addDefaultPins()
				// (in StandardFirmataModel.js) started for every analog pin.
				// Without this they keep firing forever after the widget is
				// gone - and because those timers were being routed to
				// whichever NetworkModel was created most recently, a fresh
				// widget added for the same device saw this dead connection's
				// stale/zero readings interleaved with its own live ones (the
				// value visibly oscillated). Also drop the shared sysex
				// handler this instance registered.
				try {
					_.each(self.inputs || {}, function(input) {
						if (input && input.pin && typeof input.pin.disable === 'function') {
							input.pin.disable();
						}
					});
				} catch (e) { /* best effort - instance is going away */ }

				try {
					if (self.board && self.board.io && self.board.io.clearSysexResponse) {
						self.board.io.clearSysexResponse(0x02); // GROVE_SENSOR_REPLY
					}
				} catch (e) { /* best effort */ }

				etherPortClient._reconnectTimeoutSecs = 0;
				if (etherPortClient._reconnectTimer) {
					clearTimeout(etherPortClient._reconnectTimer);
					etherPortClient._reconnectTimer = null;
				}
				if (etherPortClient._tcp) {
					etherPortClient._tcp.destroy();
				}
				self.board = undefined;
			};

			var io = new firmata.Board(etherPortClient, {
				// firmata-io's default is 5000ms - it only starts
				// querying the board's firmware/capabilities/analog
				// mapping once this "haven't heard a version yet" timer
				// expires (see firmata-io/lib/firmata.js), so the whole
				// connection sits idle for that long by default. A WiFi
				// socket connection is already fully established well
				// before this fires, unlike a serial port waiting on an
				// Arduino DTR-reset reboot, so there's no reason to wait
				// nearly as long here.
				reportVersionTimeout: 300
			});

			io.once('ready', function() {
				self.board = new five.Board({
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
