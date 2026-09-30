/**
 * DeviceStatusCheck - a brief, one-shot raw TCP probe asking a Firmata
 * device whether it currently has a standalone patch loaded, without
 * taking over the connection the way a normal NetworkModel/
 * StandaloneMonitor connection does.
 *
 * Added 2026-09-30 after a real, confusing debugging session where a
 * standalone patch was left loaded on a device and nothing in NTK
 * could tell before connecting for real - the Display widget's output
 * silently went nowhere because a DIFFERENT widget's connection had
 * already taken over. See firmata_server.py's DEVICE_STATUS_REQUEST/
 * DEVICE_STATUS_REPLY and ntk_firmata_main.py's _serve_status_connection
 * for the firmware side this mirrors exactly.
 *
 * Deliberately NOT built on etherport-client/firmata-io, same reasoning
 * as StandaloneMonitor.js - this is a plain socket that sends one
 * request and waits for one reply, then closes. Unlike
 * StandaloneMonitor, this only ever expects ONE reply and then the
 * device closes the connection itself, so there's no ongoing listener
 * to keep alive.
 *
 * Callers MUST check whether a real hardware connection to this same
 * device already exists (self.hardwareModels in nlMultiClientSync.js)
 * BEFORE calling this - the device can only serve one connection at a
 * time, and unlike StandaloneMonitor's client:startMonitor handler,
 * this deliberately does NOT force-close an existing connection to
 * make room, since a routine background poll forcibly disconnecting a
 * widget's real, working connection would be far worse than just
 * skipping the poll that one cycle.
 */
module.exports = function checkDeviceStatus(host, port, callback) {
	var net = require('net');

	var START_SYSEX = 0xF0;
	var END_SYSEX = 0xF7;
	var DEVICE_STATUS_REQUEST = 0x0C;
	var DEVICE_STATUS_REPLY = 0x0D;
	var DEVICE_STATUS_STANDALONE = 2;

	// Must comfortably exceed the ~5s dns.lookup('somename.local') time
	// on macOS this project already found and documented (NetworkModel.js's
	// own EtherPortClient._connect patch, and its 10000ms socket timeout) -
	// 2.5s here would time out an mDNS hostname before DNS even resolves,
	// every single poll. A plain IP resolves instantly and returns well
	// under this regardless, so there's no cost to a generous ceiling.
	var TIMEOUT_MS = 8000;

	var socket = new net.Socket();
	var rxBuffer = Buffer.alloc(0);
	var done = false;

	function finish(status, error) {
		if (done) return;
		done = true;
		try { socket.destroy(); } catch (e) { /* already closed */ }
		callback(status, error);
	}

	socket.setTimeout(TIMEOUT_MS);
	socket.on('timeout', function() {
		finish(null, 'timed out');
	});
	socket.on('error', function(err) {
		finish(null, err.message);
	});
	socket.on('close', function() {
		// A close with no reply ever decoded (e.g. the device's own
		// peek window - firmata_server.py's DEVICE_STATUS_REQUEST
		// comment - expired without recognizing this as a status
		// request, or something else is already connected and this
		// probe never even got accepted) counts as "couldn't tell",
		// not a hard error - the caller treats null the same either
		// way (see nlMultiClientSync.js's client:checkDeviceStatus).
		finish(null, null);
	});

	socket.connect(port, host, function() {
		socket.write(Buffer.from([START_SYSEX, DEVICE_STATUS_REQUEST, END_SYSEX]));
	});

	socket.on('data', function(chunk) {
		rxBuffer = Buffer.concat([rxBuffer, chunk]);
		var startIdx = rxBuffer.indexOf(START_SYSEX);
		if (startIdx === -1) return;
		var endIdx = rxBuffer.indexOf(END_SYSEX, startIdx);
		if (endIdx === -1) return;
		var msg = rxBuffer.slice(startIdx, endIdx + 1);
		if (msg[1] !== DEVICE_STATUS_REPLY) return;
		var statusByte = msg[2];
		finish(statusByte === DEVICE_STATUS_STANDALONE ? 'standalone' : 'waiting', null);
	});
};
