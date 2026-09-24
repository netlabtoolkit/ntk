module.exports = function(attributes) {

	var _ = require('underscore'),
		events = require('events'),
		mqtt = require('mqtt'),
		// Captured here, NOT read as this.address/this.port later -
		// nlHardware/Hardware.js deliberately overwrites model.address
		// with the FULL "Cloud:host:port" key right after construction
		// (used elsewhere - see nlMultiClientSync.js's bindModelToTransport
		// - to broadcast changes under the exact instance key clients
		// expect), so this.address is NOT the bare broker hostname by the
		// time connect() runs. Real bug hit 2026-09-24: produced the
		// malformed URL "mqtt://Cloud:io.adafruit.com:1883:1883".
		address = attributes.address,
		port = attributes.port;

	var constructor = function() {
		// Real MQTT.Client, created lazily once real connection details
		// (username/password/tls) are known - see connect() below, called
		// from setIOMode the first time a widget actually wires up to this
		// model. Until then this instance exists (so widgets can register
		// CloudIn/CloudOut sources against it, same as any other hardware
		// model) but has nothing to publish/subscribe with yet.
		this.client = null;
		this.connected = false;
		this.everConnected = false;

		// Per-topic sendInterval throttle state (see set() below) -
		// keyed by topic since one broker connection can carry multiple
		// CloudOut widgets, each with its own interval.
		this.sendIntervals = {};
		this.lastSentAt = {};
		this.pendingSendTimeouts = {};
		// Per-topic settle-check timers - see scheduleSettleCheck() below.
		this.settleTimeouts = {};
		// Per-topic "average inputs" state - mirrors the OLD CloudOut's
		// averageInputs option (accumulate every value seen during the
		// wait period, publish the mean instead of just the latest one).
		// Re-added 2026-09-24 per explicit request.
		this.averageInputs = {};
		this.pendingSum = {};
		this.pendingCount = {};
		// Self-echo suppression (see the 'message' handler below) -
		// MQTT 3.1.1 has no way to tell a broker "don't deliver my own
		// publishes back to me" (that's an MQTT5 subscribe option this
		// protocol version doesn't have), so a client subscribed to the
		// same topic it publishes to receives its own messages back as
		// ordinary incoming ones. Without this, a CloudIn pointed at the
		// same topic as a CloudOut on the same broker (a natural thing
		// to do when testing round-trip) creates a real feedback loop:
		// publish -> broker echoes it back -> looks like a genuine new
		// value -> republished -> echoed again... Found 2026-09-24,
		// most visible as averaging looking broken (a real N-sample
		// average publishes correctly, immediately followed by a
		// spurious "1-sample average" of that same value).
		this.lastPublishedValue = {};
		this.lastPublishedAt = {};

		return this;
	};

	// Base CloudHardwareModel - one instance per distinct host:port (see
	// nlHardware/Hardware.js's dispatch and nlMultiClientSync.js's
	// self.hardwareModels, keyed "Cloud:<host>:<port>"). CloudIn/CloudOut
	// widgets pointed at the same broker share this one instance and its
	// one underlying MQTT connection, same as multiple OSCIn/OSCOut
	// widgets share one OSC.js instance - see that file for the sibling
	// pattern this one is modeled on.
	var CloudHardwareModel = {
		get: function(field) {
			return this.receiving[field];
		},
		// Called once a widget actually wants a live connection (see
		// CloudIn.js/CloudOut.js's enableDevice, which threads username/
		// password/tls through Widget:hardwareSwitch -> client:changeIOMode
		// -> here, the same path GroveSensor's pin/sensorMode fields
		// already use for widget-specific extras beyond port/mode). See
		// the guard below for exactly when a later call is allowed to
		// take over vs. treated as a no-op.
		connect: function connect(options) {
			var username = options && options.username,
				password = options && options.password,
				tls = !!(options && options.tls);

			if (this.client) {
				// A client already exists for this broker - normally a
				// hard no-op, since this model is shared by every widget
				// pointed at the same host:port (see the module
				// docstring), and each widget independently re-sends ITS
				// OWN username/password every time it calls setIOMode
				// (CloudOut.js's enableDevice() does this on every value
				// change, not just once) - reconnecting on every apparent
				// credential "mismatch" meant two widgets on the same
				// broker with even slightly different field state (one
				// blank, one filled in) fought forever, tearing the
				// connection down before a subscription ever had a
				// chance to receive anything (found 2026-09-24).
				//
				// EXCEPTION: if this.connected has never once been true
				// (this.everConnected), the existing client never
				// actually succeeded - most commonly because the FIRST
				// widget to bootstrap did so with blank/wrong
				// credentials (its fields not filled in yet), which the
				// broker rejected ("Bad username or password"). Without
				// this exception, that one failed attempt would
				// permanently block every later, correctly-configured
				// widget from ever connecting at all - a real regression
				// found 2026-09-24 right after the credential-fight fix
				// above was added. Only actually replace the client if
				// the new credentials differ from what's already being
				// tried, so two widgets that simply haven't connected
				// YET (both still mid-handshake) don't churn each other.
				var credsDiffer = this._lastUsername !== username
					|| this._lastPassword !== password
					|| this._lastTls !== tls;

				if (this.everConnected || !credsDiffer) {
					// Re-emit the CURRENT status even though nothing
					// about the connection itself changes - a widget
					// joining a broker that's already connected (or
					// already mid-reconnect) would otherwise never
					// learn its real state at all, since 'status' is
					// only otherwise emitted from the client's own
					// connect/reconnect/close/error events, none of
					// which fire again just because another widget
					// showed up. Found 2026-09-24: CloudIn genuinely
					// receiving live data the whole time, but stuck
					// showing "Not connected" forever because it joined
					// after CloudOut had already established the
					// connection.
					this.emit('status', {connected: this.connected});
					return;
				}

				console.log('[Cloud] retrying with different credentials for', this.address, '- previous attempt never connected');
				this.client.end(true);
				this.client = null;
			}

			// this.address is the FULL "Cloud:host:port" key this
			// instance was constructed under (see Hardware.js) - logging
			// it (not just the derived host/port) to catch two widgets
			// producing two subtly different key strings for what looks
			// like the same broker (whitespace, casing, etc.), which
			// would create two separate model instances that each pass
			// the guard above independently.
			console.log('[Cloud] connect() called for instance key:', this.address);

			this._lastUsername = username;
			this._lastPassword = password;
			this._lastTls = tls;

			var protocol = tls ? 'mqtts' : 'mqtt';
			var url = protocol + '://' + address + ':' + port;
			var connectOptions = {
				reconnectPeriod: 5000,
				connectTimeout: 10000,
			};
			if (username) connectOptions.username = username;
			if (password) connectOptions.password = password;

			var self = this;
			this.client = mqtt.connect(url, connectOptions);

			console.log('[Cloud] connecting to', url, '(username: ' + (username || '<none>') + ')');

			this.client.on('connect', function(connack) {
				self.connected = true;
				self.everConnected = true;
				console.log('[Cloud] connected to', url, connack);
				// 'status' is a generic event any hardware model can emit
				// (see nlMultiClientSync.js's bindModelToTransport) -
				// separate from 'change', which is reserved for actual
				// field/value updates (a topic's received message).
				self.emit('status', {connected: true});
				// Re-subscribe every topic a CloudIn widget already
				// registered before this (re)connect - a broker restart
				// or credential change would otherwise leave every
				// CloudIn silently deaf with no error shown anywhere.
				_.each(_.keys(self.receiving), function(topic) {
					self.client.subscribe(topic);
				});
			});
			this.client.on('reconnect', function() {
				self.connected = false;
				console.log('[Cloud] reconnecting to', url);
				self.emit('status', {connected: false, reconnecting: true});
			});
			this.client.on('close', function() {
				self.connected = false;
				console.log('[Cloud] connection closed:', url);
				self.emit('status', {connected: false});
			});
			this.client.on('error', function(err) {
				self.connected = false;
				console.log('[Cloud] error on', url, '-', String(err && err.message || err));
				self.emit('status', {connected: false, error: String(err && err.message || err)});
			});
			this.client.on('message', function(topic, payload) {
				var value = payload.toString();

				// Self-echo suppression - see the constructor comment on
				// lastPublishedValue/lastPublishedAt. A 5s window is
				// generous relative to any realistic sendInterval,
				// deliberately: a genuine external publisher happening
				// to send the exact same value we just did, within 5s of
				// our own publish, on OUR OWN topic, is a coincidence
				// worth risking - the alternative (no suppression) is a
				// guaranteed infinite feedback loop whenever CloudIn/
				// CloudOut share a topic, which is real and was hit
				// tonight, not hypothetical.
				if (self.lastPublishedValue[topic] === value && (Date.now() - (self.lastPublishedAt[topic] || 0)) < 5000) {
					console.log('[Cloud] suppressing self-echo on', topic, '=', value);
					return;
				}

				if (self.receiving[topic] !== value) {
					self.receiving[topic] = value;
					self.emit('change', {field: topic, value: value});
				}
			});
		},
		// field is always a bare topic string here (unlike OSC.js's field,
		// which sometimes embeds "address:ip:port" for an arbitrary
		// per-message target) - this model's own address/port ARE the
		// target, fixed for its whole lifetime, so a CloudOut's outgoing
		// topic never needs to carry a destination inside the field name.
		//
		// sendInterval throttle lives HERE, not in CloudOut.js, because
		// this is the one guaranteed chokepoint every publish passes
		// through regardless of which client-side path triggered it.
		// Found 2026-09-24: CloudOut.js originally wrapped its own
		// syncWithSource calls in a throttle, but WidgetMulti.js's base
		// class ALSO binds checkOutputMappingUpdate directly to model
		// changes (see WidgetMulti.js:57), which calls enableDevice()
		// unconditionally the moment 'out' changes and activeOut is true
		// - completely bypassing that client-side throttle. And
		// syncWithSource's own output branch sets the shared hardware
		// model directly, bypassing enableDevice() entirely too. Three
		// different paths, no shared client-side gate - only the server
		// sees every one of them.
		set: function(field, value) {
			if (!this.client) {
				return this;
			}

			// Always keep 'sending' current immediately, even while
			// throttled - a publish that reads it (when averaging is
			// off) gets whatever's latest at the moment it actually
			// fires, not a value captured back when the timer was first
			// scheduled, so a second/third change arriving inside one
			// throttle window doesn't get lost to a stale closure.
			this.sending[field] = value;

			// Accumulate for averaging regardless of whether it's
			// actually enabled for this topic - cheap, and means
			// flipping the option on mid-session doesn't need any extra
			// bookkeeping. Mirrors the OLD CloudOut's averageInputs
			// option (accumulate every value seen during the wait
			// period, publish the mean instead of just the latest one),
			// re-added 2026-09-24. Only meaningfully differs from
			// "latest value" when a real sendInterval throttle window is
			// open - with no throttle, every set() publishes immediately
			// as a window of one sample, same as before.
			this.pendingSum[field] = (this.pendingSum[field] || 0) + Number(value);
			this.pendingCount[field] = (this.pendingCount[field] || 0) + 1;

			var self = this;
			var publishNow = function() {
				// A pending trailing-edge timer can outlive the
				// connection it was scheduled against (e.g. close()
				// firing in between) - guard rather than throw.
				if (!self.client) {
					return;
				}
				var toSend = self.averageInputs[field]
					? Math.round(self.pendingSum[field] / self.pendingCount[field])
					: self.sending[field];
				console.log('[Cloud] publishing', field, '=', toSend, '(averaged over', self.pendingCount[field], 'samples, sum:', self.pendingSum[field], ')');
				self.pendingSum[field] = 0;
				self.pendingCount[field] = 0;
				self.lastPublishedValue[field] = String(toSend);
				self.lastPublishedAt[field] = Date.now();
				self.client.publish(field, String(toSend));
				// Separate from 'change' (reserved for actual INCOMING
				// topic values, which CloudIn reads) - lets CloudOut show
				// what it actually just published, not just its own
				// current dial position. Matters most with averaging on,
				// where the published value can differ a lot from
				// whatever's on the dial right now.
				self.emit('published', {field: field, value: toSend});
				self.scheduleSettleCheck(field);
			};

			var sendInterval = this.sendIntervals[field] || 0;
			if (sendInterval <= 0) {
				publishNow();
				return this;
			}

			var elapsed = Date.now() - (this.lastSentAt[field] || 0);

			if (elapsed >= sendInterval) {
				this.lastSentAt[field] = Date.now();
				publishNow();
			} else if (!this.pendingSendTimeouts[field]) {
				this.pendingSendTimeouts[field] = setTimeout(function() {
					delete self.pendingSendTimeouts[field];
					self.lastSentAt[field] = Date.now();
					publishNow();
				}, sendInterval - elapsed);
			}
			return this;
		},
		// After averaging settles - one more interval with no new
		// samples arriving - publish the exact CURRENT value (not an
		// average) as a final correction. Averaging over an active
		// window can land on a mean that doesn't exactly match where
		// the input actually came to rest (e.g. it stopped moving
		// partway through a window), so the last thing published could
		// be slightly off from the true final value forever, with
		// nothing to correct it since no further set() calls would ever
		// happen. Explicit request 2026-09-24: "wait a last timer
		// interval and then send the final value."
		scheduleSettleCheck: function scheduleSettleCheck(field) {
			var self = this;
			clearTimeout(this.settleTimeouts[field]);

			var interval = this.sendIntervals[field] || 0;
			if (interval <= 0) {
				// No throttle window at all - every set() already
				// publishes immediately, so "settling" is meaningless
				// here (the last publish IS always the exact value).
				return;
			}

			this.settleTimeouts[field] = setTimeout(function() {
				delete self.settleTimeouts[field];
				if (self.pendingCount[field] > 0) {
					// Something changed since the last publish - the
					// normal throttle path already handled it (or will,
					// via its own pending timeout), which will schedule
					// its own settle check afterward. Nothing to do here.
					return;
				}
				var settledValue = self.sending[field];
				if (self.client && String(settledValue) !== self.lastPublishedValue[field]) {
					console.log('[Cloud] settle publish', field, '=', settledValue, '(last published was', self.lastPublishedValue[field], ')');
					self.lastPublishedValue[field] = String(settledValue);
					self.lastPublishedAt[field] = Date.now();
					self.client.publish(field, String(settledValue));
					self.emit('published', {field: field, value: settledValue});
				}
			}, interval);
		},
		setPollSpeed: function(highLow) {
		},
		// mode: 'in' registers+subscribes a topic for a CloudIn widget,
		// 'out' just registers a topic as a known publish target for a
		// CloudOut widget (nothing to subscribe to). options carries
		// username/password/tls (see connect() above) - always present
		// on the first call for a given widget (CloudIn.js/CloudOut.js
		// send them on every enableDevice(), not just the first).
		setIOMode: function setIOMode(topic, mode, options) {
			this.connect(options);

			if (mode == 'in') {
				if (this.receiving[topic] === undefined) {
					this.receiving[topic] = 0;
				}
				if (this.client && this.connected) {
					this.client.subscribe(topic);
				} else if (this.client) {
					// Not connected yet - the 'connect' handler above
					// re-subscribes every known receiving topic once it
					// fires, so this topic will be picked up then.
				}
			} else if (mode == 'out') {
				if (this.sending[topic] === undefined) {
					this.sending[topic] = 0;
				}
				// Stored per-topic (not per-model) since one broker
				// connection can carry multiple CloudOut widgets, each
				// with its own sendInterval. See set() below for why the
				// throttle has to live HERE, server-side, rather than in
				// CloudOut.js.
				this.sendIntervals[topic] = parseInt(options && options.sendInterval, 10) || 0;
				this.averageInputs[topic] = !!(options && options.averageInputs);
			}
		},
		// Releases the real MQTT connection this instance opened - see
		// nlMultiClientSync.js, which calls this once no widget still
		// references this model (pruneHardwareModelIfUnused/
		// pruneOrphanedHardwareModels), same lifecycle every other
		// hardware model gets.
		close: function close() {
			console.log('[Cloud] closing connection for', this.address);
			if (this.client) {
				this.client.end(true);
				this.client = null;
			}
			this.connected = false;
			_.each(this.pendingSendTimeouts, function(timeout) { clearTimeout(timeout); });
			_.each(this.settleTimeouts, function(timeout) { clearTimeout(timeout); });
			this.pendingSendTimeouts = {};
			this.settleTimeouts = {};
		},
	};
	_.extend(constructor.prototype, CloudHardwareModel);

	// EVENTS
	events.EventEmitter.call(constructor.prototype);
	_.extend(constructor.prototype, events.EventEmitter.prototype);

	// MODEL PROPERTIES
	_.extend(constructor.prototype, {
		type: 'Cloud',
		receiving: {},
		sending: {},
	});

	_.extend(constructor.prototype, attributes);

	return new constructor();
};
