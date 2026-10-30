// One WiThrottle session with a command station - DCC-EX on port 2560,
// or JMRI - shared by every DCC widget pointed at the same host:port
// (instance key "WiThrottle:host:port", see Hardware.js), the way
// CloudModel.js shares one broker connection. The address "simulated"
// uses an in-memory station instead (see withrottle.js), so a patch can
// be tried with no layout connected.
//
// Fields set() takes and 'change' emits, per loco ("S3" = short address
// 3, "L1234" = long):
//   S3:speed      0-126, rounded; sent at most every SPEED_INTERVAL_MS
//   S3:direction  1 forward / 0 reverse
//   S3:f<n>       function n on (1) / off (0)
//   S3:stop       (set only) emergency stop for this loco
//   S3:acquired   (change only) 1 once the station has handed it over
// and power (set: 1 on / 0 off), reported through 'status'.
//
// A loco is acquired by setIOMode(key, 'acquire', {wid}) and released
// once no widget wants it any more ('release'). On acquire the loco
// takes the station's state - another throttle may already be driving
// it - rather than pushing NTK's.

var wt = require('./withrottle');

var CONNECT_TIMEOUT_MS = 5000;
// The station accepts a 10th client's TCP connection and then says
// nothing at all (phase 0 spike), so no greeting in time means "full".
var GREETING_TIMEOUT_MS = 5000;
var RECONNECT_MS = 5000;
var SPEED_INTERVAL_MS = 100;
// How long a value NTK sent is expected back from the station as an
// echo, rather than being someone else's change.
var ECHO_MS = 2000;
// A function toggle whose echo never came (e.g. a function the loco's
// decoder or roster doesn't have) stops blocking new requests after this.
var TOGGLE_WAIT_MS = 1500;
var THROTTLE_IDS = 'T0123456789ABCDEFGHIJ';

// One simulated station for the whole NTK, so two widgets (or later a
// board, through a TCP listener) see the same trains.
var simulatedStation = null;

module.exports = function(attributes) {
	var _ = require('underscore'),
		events = require('events'),
		net = require('net'),
		os = require('os'),
		// Captured here - Hardware.js overwrites model.address with the
		// full "WiThrottle:host:port" key after construction (same as
		// CloudModel.js).
		host = String(attributes.address || '').trim(),
		port = parseInt(attributes.port, 10) || 2560,
		simulated = host.toLowerCase() === 'simulated';

	var label = simulated ? 'simulated station' : host + ':' + port;

	var constructor = function() {
		this.locos = {};
		this.session = null;
		this.connected = false;
		this.power = null;
		this.error = null;
		this.closed = false;
		this.heartbeatTimer = null;
		this.reconnectTimer = null;
		return this;
	};

	var WiThrottleModel = {
		type: 'WiThrottle',

		get: function(field) {
			var parts = /^([SL]\d+):(\w+)$/.exec(field || '');
			var loco = parts && this.locos[parts[1]];
			return loco ? loco[parts[2]] : undefined;
		},

		/**
		 * setIOMode - a widget wants a loco ('acquire') or is done with
		 * it ('release'). options.wid says which widget, so two widgets on
		 * the same loco share it and it's only released when both are off.
		 */
		setIOMode: function(key, mode, options) {
			var wid = (options && options.wid) || 'unknown';

			if (mode === 'acquire') {
				if (!/^[SL]\d+$/.test(key)) { return; }
				var loco = this.locos[key];
				if (!loco) {
					loco = this.locos[key] = this._newLoco(key);
				}
				loco.wids[wid] = true;
				this.closed = false;
				this._open();

				if (this.connected && !loco.acquired && !loco.acquiring) {
					this._acquire(key);
				}
				else if (loco.acquired) {
					// Another widget already has it - hand this one the
					// current state.
					this._emitLocoState(key);
				}
				this._emitStatus();
			}
			else if (mode === 'release') {
				// Release whatever this widget holds, whichever key it names
				// - the widget may have already moved to another address.
				_.each(_.keys(this.locos), function(k) {
					var l = this.locos[k];
					if (!l.wids[wid]) { return; }
					delete l.wids[wid];
					if (_.isEmpty(l.wids)) { this._release(k); }
				}, this);
			}
		},

		set: function(field, value) {
			if (field === 'power') {
				this._write(wt.commands.power(Number(value) > 0.5));
				return;
			}

			var parts = /^([SL]\d+):(\w+)$/.exec(field || '');
			if (!parts) { return; }
			var key = parts[1], what = parts[2], loco = this.locos[key];
			if (!loco) { return; }
			value = Number(value);
			if (isNaN(value)) { return; }

			if (what === 'speed') {
				var speed = Math.max(0, Math.min(126, Math.round(value)));
				if (speed !== loco.speed) {
					loco.speed = speed;
					this.emit('change', {field: key + ':speed', value: speed});
				}
				this._sendSpeed(key);
			}
			else if (what === 'direction') {
				var direction = value > 0.5 ? 1 : 0;
				if (direction !== loco.direction) {
					loco.direction = direction;
					this.emit('change', {field: key + ':direction', value: direction});
					if (this._canDrive(loco)) {
						this._expectEcho(loco, 'direction', direction);
						this._write(wt.commands.direction(loco.throttle, key, direction));
					}
				}
			}
			else if (what === 'stop') {
				clearTimeout(loco.speedTimer);
				loco.speedTimer = null;
				loco.speed = 0;
				loco.sentSpeed = 0;
				this.emit('change', {field: key + ':speed', value: 0});
				if (this._canDrive(loco)) {
					loco.lastSpeedAt = Date.now();
					this._expectEcho(loco, 'speed', 0);
					this._write(wt.commands.estop(loco.throttle, key));
				}
			}
			else if (/^f\d+$/.test(what)) {
				this._setFunction(key, parseInt(what.slice(1), 10), value > 0.5 ? 1 : 0);
			}
		},

		close: function() {
			console.log('[DCC] closing session with', label);
			this.closed = true;
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
			_.each(_.keys(this.locos), function(key) {
				this._release(key);
			}, this);
			this._write(wt.commands.quit());
			this._endSession();
		},

		// ----- connection -----

		_open: function() {
			if (this.session || this.closed) { return; }
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;

			var self = this;
			var session = this.session = {lines: '', greeted: false};
			console.log('[DCC] connecting to', label);
			this.error = null;
			this._emitStatus({connecting: true});

			var onLine = function(line) {
				if (self.session === session) { self._onLine(line); }
			};

			if (simulated) {
				if (!simulatedStation) { simulatedStation = wt.createSimulatedStation(); }
				// Both directions are deferred, like a network would - and
				// so nothing is handled in the middle of a set() call.
				var conn = simulatedStation.connect(function(line) {
					setImmediate(onLine, line);
				});
				session.write = function(line) { setImmediate(function() { conn.receive(line); }); };
				session.end = function() { conn.close(); };
			}
			else {
				var socket = net.connect({host: host, port: port});
				socket.setEncoding('utf8');
				socket.setNoDelay(true);
				var connectTimer = setTimeout(function() {
					self._fail(session, 'No answer from ' + label);
				}, CONNECT_TIMEOUT_MS);

				socket.on('connect', function() { clearTimeout(connectTimer); });
				socket.on('data', function(chunk) {
					session.lines += chunk;
					var parts = session.lines.split(/\r?\n/);
					session.lines = parts.pop();
					parts.forEach(function(line) { if (line.trim()) { onLine(line); } });
				});
				socket.on('error', function(err) {
					clearTimeout(connectTimer);
					var code = err && err.code;
					self._fail(session, code === 'ECONNREFUSED' ? label + ' refused the connection - is WiThrottle on?'
						: code === 'EHOSTUNREACH' || code === 'ENETUNREACH' || code === 'ETIMEDOUT' ? 'Can\'t reach ' + label
						: code === 'ENOTFOUND' ? 'No station named ' + host
						: 'Connection error: ' + String(err && err.message || err));
				});
				socket.on('close', function() {
					clearTimeout(connectTimer);
					self._fail(session, session.greeted ? 'Station closed the connection' : null);
				});
				session.write = function(line) { socket.write(line + '\n'); };
				// end(), not destroy(): the stop / release / Q just written
				// must still reach the station.
				session.end = function() {
					socket.removeAllListeners('close');
					socket.on('error', function() {});
					socket.end();
					setTimeout(function() { socket.destroy(); }, 1000);
				};
			}

			session.greetingTimer = setTimeout(function() {
				if (!session.greeted) {
					self._fail(session, label + ' isn\'t answering - it takes at most 9 throttles; is it full?');
				}
			}, GREETING_TIMEOUT_MS);

			wt.commands.hello('NTK', 'NTK-' + os.hostname().replace(/[^A-Za-z0-9]/g, '')).forEach(session.write);
		},

		// The session ended or never started. Try again later while any
		// widget still wants a loco - a station gets switched off and on
		// with the layout.
		_fail: function(session, message) {
			if (this.session !== session) { return; }
			if (message) {
				console.log('[DCC]', message);
				this.error = message;
			}
			this._endSession();
			this._emitStatus();

			if (!this.closed && !_.isEmpty(this.locos) && !this.reconnectTimer) {
				var self = this;
				this.reconnectTimer = setTimeout(function() {
					self.reconnectTimer = null;
					self._open();
				}, RECONNECT_MS);
			}
		},

		_endSession: function() {
			var session = this.session;
			this.session = null;
			this.connected = false;
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
			_.each(this.locos, function(loco) {
				loco.acquired = false;
				loco.acquiring = false;
				clearTimeout(loco.speedTimer);
				loco.speedTimer = null;
			});
			if (session) {
				clearTimeout(session.greetingTimer);
				session.end();
			}
		},

		_write: function(line) {
			if (this.session) { this.session.write(line); }
		},

		_heartbeatEvery: function(seconds) {
			var self = this;
			clearInterval(this.heartbeatTimer);
			// Half the station's interval, as the protocol asks.
			this.heartbeatTimer = setInterval(function() {
				self._write(wt.commands.heartbeat());
			}, Math.max(1, seconds / 2) * 1000);
		},

		_onLine: function(line) {
			_.each(wt.parseLine(line), function(event) {
				var loco = event.key && this.locos[event.key];

				switch (event.type) {
				case 'version':
					if (!this.session.greeted) {
						this.session.greeted = true;
						clearTimeout(this.session.greetingTimer);
						this.connected = true;
						this.error = null;
						console.log('[DCC] connected to', label, '(WiThrottle', event.value + ')');
						this._write(wt.commands.heartbeatOn());
						this._heartbeatEvery(10);
						_.each(_.keys(this.locos), function(key) { this._acquire(key); }, this);
						this._emitStatus();
					}
					break;
				case 'heartbeat':
					// The station first says *2, then *10 once connected.
					if (event.seconds > 0) { this._heartbeatEvery(event.seconds); }
					break;
				case 'power':
					this.power = event.value;
					this._emitStatus();
					break;
				case 'message':
					console.log('[DCC]', label, 'says:', event.text);
					break;
				case 'acquired':
					if (loco) {
						loco.acquiring = false;
						loco.acquired = true;
						this.emit('change', {field: event.key + ':acquired', value: 1});
					}
					break;
				case 'released':
					if (loco && loco.acquired && !loco.acquiring) {
						loco.acquired = false;
						this.emit('change', {field: event.key + ':acquired', value: 0});
					}
					break;
				case 'speed':
					if (loco) {
						var speed = Math.round(event.value);
						if (this._isEcho(loco, 'speed', speed)) { break; }
						loco.speed = speed;
						loco.sentSpeed = speed;
						this.emit('change', {field: event.key + ':speed', value: speed});
					}
					break;
				case 'direction':
					if (loco && !this._isEcho(loco, 'direction', event.value)) {
						loco.direction = event.value;
						this.emit('change', {field: event.key + ':direction', value: event.value});
					}
					break;
				case 'function':
					if (loco) { this._functionReported(event.key, event.fn, event.value); }
					break;
				}
			}, this);
		},

		_emitStatus: function(extra) {
			this.emit('status', _.extend({
				connected: this.connected,
				power: this.power,
				error: this.error,
				simulated: simulated,
			}, extra));
		},

		// ----- locos -----

		_newLoco: function(key) {
			var used = _.pluck(this.locos, 'throttle');
			var throttle = _.find(THROTTLE_IDS.split(''), function(c) { return used.indexOf(c) === -1; }) || 'T';
			return {
				throttle: throttle,
				wids: {},
				acquired: false,
				acquiring: false,
				speed: 0,
				sentSpeed: 0,
				lastSpeedAt: 0,
				speedTimer: null,
				direction: 1,
				fns: {},
				fnToggle: {},
				echoes: [],
			};
		},

		_acquire: function(key) {
			var loco = this.locos[key];
			if (!loco || !this.connected) { return; }
			loco.acquiring = true;
			loco.echoes = [];
			this._write(wt.commands.acquire(loco.throttle, key));
		},

		// Stop the loco and give it back to the station. A plain stop,
		// not an E-stop, so a loco with momentum slows down normally.
		_release: function(key) {
			var loco = this.locos[key];
			if (!loco) { return; }
			clearTimeout(loco.speedTimer);
			if (this._canDrive(loco)) {
				if (loco.sentSpeed !== 0) { this._write(wt.commands.speed(loco.throttle, key, 0)); }
				this._write(wt.commands.release(loco.throttle, key));
			}
			delete this.locos[key];
		},

		_canDrive: function(loco) {
			return this.connected && loco.acquired;
		},

		_emitLocoState: function(key) {
			var loco = this.locos[key];
			this.emit('change', {field: key + ':acquired', value: 1});
			this.emit('change', {field: key + ':speed', value: loco.speed});
			this.emit('change', {field: key + ':direction', value: loco.direction});
			_.each(loco.fns, function(on, fn) {
				this.emit('change', {field: key + ':f' + fn, value: on});
			}, this);
		},

		// Latest speed, at most every SPEED_INTERVAL_MS, nothing for an
		// unchanged one.
		_sendSpeed: function(key) {
			var loco = this.locos[key], self = this;
			if (!loco || !this._canDrive(loco) || loco.speedTimer) { return; }
			var wait = SPEED_INTERVAL_MS - (Date.now() - loco.lastSpeedAt);
			if (wait > 0) {
				loco.speedTimer = setTimeout(function() {
					loco.speedTimer = null;
					self._sendSpeed(key);
				}, wait);
				return;
			}
			if (loco.speed === loco.sentSpeed) { return; }
			loco.sentSpeed = loco.speed;
			loco.lastSpeedAt = Date.now();
			this._expectEcho(loco, 'speed', loco.speed);
			this._write(wt.commands.speed(loco.throttle, key, loco.speed));
		},

		// The station echoes every V / R straight back. Those echoes
		// mustn't count as someone else's change: with a fast stream of
		// speeds, the echo of an older one arriving would otherwise pull
		// the speed back.
		_expectEcho: function(loco, kind, value) {
			loco.echoes.push({kind: kind, value: value, at: Date.now()});
		},

		_isEcho: function(loco, kind, value) {
			var now = Date.now();
			loco.echoes = _.filter(loco.echoes, function(e) { return now - e.at < ECHO_MS; });
			var mine = _.filter(loco.echoes, function(e) { return e.kind === kind; });
			var index = -1;
			for (var i = 0; i < mine.length; i++) {
				if (mine[i].value === value) { index = i; break; }
			}
			// Drop this kind's expected echoes up to the one that came
			// back - or all of them, if this was someone else's change.
			var drop = index === -1 ? mine : mine.slice(0, index + 1);
			loco.echoes = _.difference(loco.echoes, drop);
			return index !== -1;
		},

		// DCC-EX only offers "press" (which toggles) for functions, so
		// setting one means toggling it when it's not already as wanted,
		// and waiting for the station's report before toggling again.
		_setFunction: function(key, fn, on) {
			var loco = this.locos[key];
			if (!loco || !this._canDrive(loco)) { return; }
			var pending = loco.fnToggle[fn];
			if (pending && Date.now() - pending.at < TOGGLE_WAIT_MS) {
				if (pending.want !== on) {
					pending.want = on;
					pending.changed = true;
				}
				return;
			}
			if ((loco.fns[fn] || 0) === on) { return; }
			loco.fnToggle[fn] = {at: Date.now(), want: on};
			var self = this;
			wt.commands.toggleFunction(loco.throttle, key, fn).forEach(function(line) { self._write(line); });
		},

		_functionReported: function(key, fn, on) {
			var loco = this.locos[key];
			loco.fns[fn] = on;
			this.emit('change', {field: key + ':f' + fn, value: on});

			var pending = loco.fnToggle[fn];
			delete loco.fnToggle[fn];
			// Asked for something else while the toggle was on its way.
			// Only then - a momentary function reports on, then off, by
			// itself, and chasing that would toggle forever.
			if (pending && pending.want !== on && pending.changed) {
				this._setFunction(key, fn, pending.want);
			}
		},
	};

	_.extend(constructor.prototype, WiThrottleModel);

	events.EventEmitter.call(constructor.prototype);
	_.extend(constructor.prototype, events.EventEmitter.prototype);

	return new constructor();
};
