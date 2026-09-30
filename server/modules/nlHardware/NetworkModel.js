
module.exports = function(attributes) {
	var argHostPort = [attributes.address, attributes.port];

	var EtherPortClient = require("etherport-client").EtherPortClient;

	// etherport-client hardcodes a 5000ms connect timeout in its own
	// _connect() (node_modules/etherport-client/index.js) - too short
	// for an mDNS ".local" hostname on macOS. net.Socket.connect() does
	// its own DNS resolution internally, and dns.lookup('somename.local')
	// reliably takes ~5s to resolve via getaddrinfo() here (confirmed
	// empirically 2026-09-26: 5007ms against this library's 5000ms
	// timeout - always loses the race by a hair). A plain IP address
	// resolves instantly and is unaffected.
	// Patched on the shared prototype, not just this instance - the
	// constructor calls this._connect() synchronously as its last
	// statement, before `new EtherPortClient(...)` below ever returns
	// control here, so an instance-level override would miss that first
	// attempt and only take effect on the next 15s auto-retry (meaning
	// every FIRST connection to an mDNS hostname would appear to fail
	// for ~20s before silently succeeding on retry).
	EtherPortClient.prototype._connect = function () {
		this._tcp.setNoDelay(true);
		this._tcp.setTimeout(10000);
		this._tcp.connect(this.port, this.host);
	};

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

			// etherport-client's own _tcp 'error'/'timeout' handlers just
			// call its internal _reconnect() (every 15s, forever - see
			// self.close's own comment above) and never emit anything
			// publicly themselves - a bad/unset IP failed completely
			// silently, everywhere in the stack, with no way for a user
			// to tell "still connecting" from "will never connect"
			// (found from a real user report 2026-09-22: forgot to set
			// the IP, had no way to tell anything was wrong). Node
			// EventEmitters support multiple listeners per event, so
			// this taps the SAME raw socket's own 'error'/'timeout'
			// alongside etherport-client's internal ones, without
			// needing any change to that library. Reported once per
			// "not yet ever connected" streak, not on every 15s retry -
			// nlMultiClientSync.js relays this to the client as
			// server:hardwareConnectionFailed.
			var reportedConnectionFailure = false;
			function reportConnectionFailureOnce(err) {
				if (self.connected || reportedConnectionFailure) return;
				reportedConnectionFailure = true;
				self.emit('connectionFailed', {
					host: networkHost,
					port: networkPort,
					error: err && err.message ? err.message : String(err),
				});
			}
			etherPortClient._tcp.on('error', reportConnectionFailureOnce);
			etherPortClient._tcp.on('timeout', function() {
				reportConnectionFailureOnce(new Error('connection timed out'));
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
