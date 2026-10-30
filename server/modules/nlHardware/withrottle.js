// WiThrottle protocol, without sockets or timers: lines in -> events,
// commands -> lines. Used by WiThrottleModel.js (the connection) and
// tested on its own by test/withrottle-test.js. Message formats are the
// ones checked against Phil's EX-CSB1 (DCC-EX v5.6.6) in the phase 0
// spike - see plans/dcc-ex-widgets.md, "WiThrottle protocol" and
// "Phases".
//
// Also the simulated station: a command station kept in memory that
// answers like DCC-EX does, so a patch can be built and tried with no
// layout connected (address "simulated" on a DCC widget).

'use strict';

var SEP = '<;>';

// DCC-EX: short addresses 1-127, long above. null for anything that
// isn't a usable loco address.
function locoKey(address) {
	var n = Number(address);
	if (!(n >= 1 && n <= 10239) || Math.floor(n) !== n) { return null; }
	return (n <= 127 ? 'S' : 'L') + n;
}

/**
 * parseLine - one line from the station -> a list of events (usually
 * one; none for lines nothing here needs).
 *
 *   {type: 'version', value}            VN2.0
 *   {type: 'heartbeat', seconds}        *10
 *   {type: 'power', value}              PPA1 / PPA0 (value null for PPA2, unknown)
 *   {type: 'message', text}             HM / Hm - the station's own messages
 *   {type: 'acquired', throttle, key}   MT+S3<;>
 *   {type: 'released', throttle, key}   MT-S3<;>
 *   {type: 'speed', throttle, key, value, estop}   MTAS3<;>V50 - V-1 is an E-stop, reported as 0
 *   {type: 'direction', throttle, key, value}      MTAS3<;>R1 - 1 forward, 0 reverse
 *   {type: 'function', throttle, key, fn, value}   MTAS3<;>F11 - F1 on
 */
function parseLine(line) {
	line = String(line || '').trim();
	var m;

	if ((m = /^VN(.*)$/.exec(line))) { return [{type: 'version', value: m[1]}]; }
	if ((m = /^\*(\d+)$/.exec(line))) { return [{type: 'heartbeat', seconds: parseInt(m[1], 10)}]; }
	if ((m = /^PPA([012])$/.exec(line))) { return [{type: 'power', value: m[1] === '2' ? null : parseInt(m[1], 10)}]; }
	if ((m = /^H[Mm](.*)$/.exec(line))) { return [{type: 'message', text: m[1]}]; }

	m = /^M(.)([+\-A])([SL]\d+|\*)<;>(.*)$/.exec(line);
	if (!m) { return []; }
	var throttle = m[1], action = m[2], key = m[3], rest = m[4];

	if (action === '+') { return [{type: 'acquired', throttle: throttle, key: key}]; }
	if (action === '-') { return [{type: 'released', throttle: throttle, key: key}]; }

	if ((m = /^V(-?\d+(?:\.\d+)?)$/.exec(rest))) {
		var speed = parseFloat(m[1]);
		return [{type: 'speed', throttle: throttle, key: key, value: speed < 0 ? 0 : speed, estop: speed < 0}];
	}
	if ((m = /^R([01])$/.exec(rest))) {
		return [{type: 'direction', throttle: throttle, key: key, value: parseInt(m[1], 10)}];
	}
	if ((m = /^F([01])(\d+)$/.exec(rest))) {
		return [{type: 'function', throttle: throttle, key: key, fn: parseInt(m[2], 10), value: parseInt(m[1], 10)}];
	}
	return [];
}

// Command lines, client -> station.
var commands = {
	hello: function(name, id) { return ['N' + name, 'HU' + id]; },
	heartbeatOn: function() { return '*+'; },
	heartbeat: function() { return '*'; },
	power: function(on) { return 'PPA' + (on ? 1 : 0); },
	acquire: function(throttle, key) { return 'M' + throttle + '+' + key + SEP + key; },
	release: function(throttle, key) { return 'M' + throttle + '-' + key + SEP + 'r'; },
	speed: function(throttle, key, value) { return 'M' + throttle + 'A' + key + SEP + 'V' + value; },
	estop: function(throttle, key) { return 'M' + throttle + 'A' + key + SEP + 'X'; },
	direction: function(throttle, key, value) { return 'M' + throttle + 'A' + key + SEP + 'R' + (value ? 1 : 0); },
	// A press toggles a function on DCC-EX (seen in the spike: press /
	// release twice blinked the headlight twice), so press + release is
	// one toggle.
	toggleFunction: function(throttle, key, fn) {
		return ['M' + throttle + 'A' + key + SEP + 'F1' + fn, 'M' + throttle + 'A' + key + SEP + 'F0' + fn];
	},
	quit: function() { return 'Q'; },
};

var FUNCTION_COUNT = 29;   // F0-F28, what the simulator reports on acquire

/**
 * createSimulatedStation - a DCC-EX station in memory. Each client is
 * connect(send) -> {receive(line), close()}, where send(line) delivers
 * a line to that client. Changes are announced to every client holding
 * the loco (or, for power, to everyone), like the real station.
 */
function createSimulatedStation() {
	var power = 0;
	var locos = {};     // key -> {speed, estop, direction, fns: []}
	var clients = [];

	function loco(key) {
		if (!locos[key]) {
			var fns = [];
			for (var i = 0; i < FUNCTION_COUNT; i++) { fns.push(0); }
			locos[key] = {speed: 0, estop: false, direction: 1, fns: fns};
		}
		return locos[key];
	}

	function toHolders(key, rest) {
		clients.forEach(function(client) {
			Object.keys(client.held).forEach(function(throttle) {
				if (client.held[throttle].indexOf(key) !== -1) {
					client.send('M' + throttle + 'A' + key + SEP + rest);
				}
			});
		});
	}

	function speedText(l) { return 'V' + (l.estop ? -1 : l.speed); }

	function act(key, rest) {
		var l = loco(key), m;
		if ((m = /^V(-?\d+(?:\.\d+)?)$/.exec(rest))) {
			l.speed = Math.max(0, Math.min(126, Math.round(parseFloat(m[1]))));
			l.estop = false;
			toHolders(key, speedText(l));
		}
		else if (rest === 'X') {
			l.speed = 0;
			l.estop = true;
			toHolders(key, speedText(l));
		}
		else if ((m = /^R([01])$/.exec(rest))) {
			l.direction = parseInt(m[1], 10);
			toHolders(key, 'R' + l.direction);
		}
		else if ((m = /^F1(\d+)$/.exec(rest))) {
			var fn = parseInt(m[1], 10);
			if (fn < FUNCTION_COUNT) {
				l.fns[fn] = l.fns[fn] ? 0 : 1;
				toHolders(key, 'F' + l.fns[fn] + fn);
			}
		}
	}

	return {
		// For tests.
		state: function() { return {power: power, locos: locos, clients: clients.length}; },

		connect: function(send) {
			var client = {send: send, held: {}};
			clients.push(client);

			['VN2.0', 'RL0', 'PPA' + power, 'PTL', '*10'].forEach(send);

			return {
				receive: function(line) {
					line = String(line || '').trim();
					var m;
					if (line === 'Q') { this.close(); return; }
					if ((m = /^PPA([01])$/.exec(line))) {
						power = parseInt(m[1], 10);
						clients.forEach(function(c) { c.send('PPA' + power); });
						return;
					}
					m = /^M(.)([+\-A])([SL]\d+|\*)<;>(.*)$/.exec(line);
					if (!m) { return; }
					var throttle = m[1], action = m[2], key = m[3], rest = m[4];
					var held = client.held[throttle] = client.held[throttle] || [];

					if (action === '+') {
						if (held.indexOf(key) === -1) { held.push(key); }
						var l = loco(key);
						send('M' + throttle + '+' + key + SEP);
						l.fns.forEach(function(on, fn) { send('M' + throttle + 'A' + key + SEP + 'F' + on + fn); });
						send('M' + throttle + 'A' + key + SEP + speedText(l));
						send('M' + throttle + 'A' + key + SEP + 'R' + l.direction);
						send('M' + throttle + 'A' + key + SEP + 's1');
					}
					else if (action === '-') {
						if (held.indexOf(key) !== -1) { held.splice(held.indexOf(key), 1); }
						send('M' + throttle + '-' + key + SEP);
					}
					else if (key === '*') {
						held.slice().forEach(function(k) { act(k, rest); });
					}
					else if (held.indexOf(key) !== -1) {
						act(key, rest);
					}
				},
				close: function() {
					var i = clients.indexOf(client);
					if (i !== -1) { clients.splice(i, 1); }
				},
			};
		},
	};
}

module.exports = {
	SEP: SEP,
	locoKey: locoKey,
	parseLine: parseLine,
	commands: commands,
	createSimulatedStation: createSimulatedStation,
};
