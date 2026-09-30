/**
 * StandaloneMonitor - a raw TCP connection to a device running a
 * standalone patch, opted into "monitor mode" instead of the normal
 * NetworkModel/etherport-client takeover path (see NetworkModel.js).
 *
 * Deliberately NOT built on etherport-client/firmata-io like
 * NetworkModel - this isn't a Firmata connection at all in the normal
 * sense (no pin claiming, no queryFirmware handshake). It's a plain
 * socket that sends one custom sysex request and then just listens for
 * the device's periodic replies, decoding them into
 * {wid, fields: {name: value}} objects. See the firmware side
 * (firmata_server.py's STANDALONE_MONITOR_REQUEST/REPLY and
 * encode_standalone_monitor_reply, ntk_firmata_main.py's
 * _serve_monitor_connection) for the wire format this mirrors exactly.
 */
module.exports = function(host, port) {
	var net = require('net'),
		events = require('events');

	var START_SYSEX = 0xF0;
	var END_SYSEX = 0xF7;
	var STANDALONE_MONITOR_REQUEST = 0x03;
	var STANDALONE_MONITOR_REPLY = 0x04;

	var StandaloneMonitor = function(host, port) {
		events.EventEmitter.call(this);
		var self = this;
		this.host = host;
		this.port = port;
		this.connected = false;
		this._rxBuffer = Buffer.alloc(0);

		this._socket = net.connect({host: host, port: port}, function() {
			self.connected = true;
			self.emit('connected');
			// Sent immediately, before anything else - this is what
			// ntk_firmata_main.py's _peek_for_monitor_request is
			// watching for, in a short bounded window right after
			// accept(), before it would otherwise do the normal
			// explicit-handoff release_hardware() call.
			self._socket.write(Buffer.from([START_SYSEX, STANDALONE_MONITOR_REQUEST, END_SYSEX]));
		});

		this._socket.on('data', function(data) {
			self._rxBuffer = Buffer.concat([self._rxBuffer, data]);
			self._processBuffer();
		});

		this._socket.on('error', function(err) {
			self.emit('error', err);
		});

		this._socket.on('close', function() {
			self.connected = false;
			self.emit('close');
		});
	};

	StandaloneMonitor.prototype = Object.create(events.EventEmitter.prototype);

	// Pulls every complete START_SYSEX...END_SYSEX message out of
	// whatever's accumulated in _rxBuffer so far, decodes each one, and
	// leaves any trailing partial message in the buffer for next time -
	// TCP gives no guarantee a single 'data' event lines up with one
	// complete sysex message.
	StandaloneMonitor.prototype._processBuffer = function() {
		while (true) {
			var startIdx = this._rxBuffer.indexOf(START_SYSEX);
			if (startIdx === -1) {
				this._rxBuffer = Buffer.alloc(0);
				return;
			}
			var endIdx = this._rxBuffer.indexOf(END_SYSEX, startIdx);
			if (endIdx === -1) {
				this._rxBuffer = this._rxBuffer.slice(startIdx);
				return;
			}
			var msg = this._rxBuffer.slice(startIdx, endIdx + 1);
			this._rxBuffer = this._rxBuffer.slice(endIdx + 1);
			this._decodeMessage(msg);
		}
	};

	// Mirrors encode_standalone_monitor_reply's exact wire format
	// (firmata_server.py) - see that function's own docstring for the
	// byte layout this reverses.
	StandaloneMonitor.prototype._decodeMessage = function(msg) {
		if (msg[1] !== STANDALONE_MONITOR_REPLY) {
			return;
		}
		var body = msg.slice(2, msg.length - 1);
		var i = 0;

		var widBytes = [];
		while (body[i] !== 0) {
			widBytes.push(body[i]);
			i++;
		}
		i++; // skip the 0x00 delimiter
		var wid = Buffer.from(widBytes).toString('ascii');

		var count = body[i];
		i++;

		var fields = {};
		for (var f = 0; f < count; f++) {
			var nameBytes = [];
			while (body[i] !== 0) {
				nameBytes.push(body[i]);
				i++;
			}
			i++;
			var name = Buffer.from(nameBytes).toString('ascii');

			var b0 = body[i], b1 = body[i + 1], b2 = body[i + 2];
			i += 3;
			var fixed = b0 | (b1 << 7) | (b2 << 14);
			if (fixed & 0x100000) {
				fixed -= 0x200000; // sign-extend from 21-bit two's complement
			}
			fields[name] = fixed / 100;
		}

		this.emit('value', {wid: wid, fields: fields});
	};

	StandaloneMonitor.prototype.close = function() {
		try {
			this._socket.destroy();
		} catch (e) {
			// best effort - already gone
		}
	};

	return new StandaloneMonitor(host, port);
};
