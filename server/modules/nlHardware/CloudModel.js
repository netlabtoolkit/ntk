module.exports = function(attributes) {

	// How long an Adafruit IO feed check result is reused, and how soon a
	// "no such feed" result is checked again - see _checkFeed().
	var FEED_CHECK_REUSE_MS = 60000;
	var FEED_RECHECK_MISSING_MS = 5000;

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
		// See _subscribeBrokerNotices().
		this._brokerNoticeTopics = {};
		// topic -> has anything arrived since it was last subscribed.
		this._topicHasData = {};
		// topic -> Adafruit IO feed-existence check - see _checkFeed().
		this._feedChecks = {};

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
		// Feedback-loop guard - see set() below for where this is
		// actually checked. MQTT 3.1.1 has no way to tell a broker
		// "don't deliver my own publishes back to me" (that's an MQTT5
		// subscribe option this protocol version doesn't have), so a
		// client subscribed to the same topic it publishes to receives
		// its own messages back as ordinary incoming ones - if CloudIn's
		// output is wired back into CloudOut's input on that same topic,
		// that creates a real feedback loop: publish -> broker echoes it
		// back -> CloudIn applies it -> republished -> echoed again...
		// Found 2026-09-24.
		//
		// Originally guarded on the INBOUND side instead (CloudIn
		// discarding anything matching its own model's recent publish) -
		// replaced 2026-09-29 because that blocked a legitimate, distinct
		// case: a CloudIn simply pointed at the same topic as a CloudOut
		// to watch round-trip, with nothing wired back into CloudOut at
		// all - no loop risk there, but the old inbound check couldn't
		// tell the two situations apart and silently dropped CloudOut's
		// own publishes from CloudIn's view either way. Guarding the
		// REPUBLISH instead (in set(), below) targets the actual loop
		// mechanism - a received value flowing straight back out
		// unchanged - so CloudIn now always sees genuine incoming
		// values, including a CloudOut's on the same topic.
		this.lastPublishedValue = {};
		this.lastPublishedAt = {};
		this.lastReceivedValue = {};
		this.lastReceivedAt = {};

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
		connect: function connect(options, mode) {
			var username = options && options.username,
				password = options && options.password,
				tls = !!(options && options.tls);

			// This connection is shared by every widget pointed at the
			// same host:port (see the module docstring) - a CloudIn and
			// a CloudOut on the same broker really can share one
			// instance, so this prefix can't be guaranteed correct in
			// every case. It's the mode of whichever call most recently
			// triggered connect() (setIOMode passes its own 'in'/'out'
			// straight through) - accurate for the overwhelmingly common
			// case of debugging one widget's own connection attempts,
			// which is what Phil actually asked for 2026-09-29 (plain
			// "[Cloud]" on every line made it impossible to tell CloudIn
			// and CloudOut's own attempts apart in the console).
			var prefix = mode === 'in' ? '[CloudIn]' : mode === 'out' ? '[CloudOut]' : '[Cloud]';

			// Refuse to even try with no real host configured - CloudOut's
			// own default is a blank host, and setIOMode() calls connect()
			// unconditionally (see its own comment) any time a field
			// changes while activeOut happens to be true, or from a
			// premature/accidental activation before the more panel is
			// filled in. Without this, a blank address builds the URL
			// "mqtt://:1883", which Node's own net/URL handling silently
			// treats as localhost - producing an mqtt.js client that
			// retries against 127.0.0.1 every reconnectPeriod (5s)
			// forever, with nothing short of restarting NTK to stop it,
			// against a broker that was never actually configured. Found
			// 2026-09-29 via exactly that symptom in the console.
			if (!address) {
				console.log(prefix, 'connect() called with no host set for', this.address, '- refusing (nothing to connect to)');
				this.emit('status', {connected: false, error: 'No broker host set'});
				return;
			}

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

				// SECOND EXCEPTION: options.forceReconnect - CloudOut.js
				// sets it on the first enable after the user actually
				// edits username/password/TLS (once, not on its routine
				// per-value re-sends, so it can't restart the fight
				// described above). Without it a connection that had
				// ever succeeded could never pick up changed
				// credentials at all (found 2026-10-03: editing a
				// connected CloudOut's login did nothing).
				var forced = !!(options && options.forceReconnect) && credsDiffer;

				if (!forced && (this.everConnected || !credsDiffer)) {
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

				console.log(prefix, forced
					? 'reconnecting with edited credentials for'
					: 'retrying with different credentials for', this.address,
					forced ? '' : '- previous attempt never connected');
				// Detach first - the old client's own 'close' would
				// otherwise land after the new one is created and mark
				// the NEW connection as down. The no-op 'error' listener
				// keeps a late error from the dying socket from being an
				// unhandled 'error' event.
				this.client.removeAllListeners();
				this.client.on('error', function() {});
				this.client.end(true);
				this.client = null;
				this.connected = false;
				this.everConnected = false;
			}

			// The broker already refused exactly these credentials (see
			// the 'error' handler below, which drops the client when
			// that happens) - trying them again can't end differently,
			// and widgets call in here constantly (CloudOut on every
			// value change), so without this a wrong password meant an
			// endless stream of login attempts. Only an explicit request
			// (forceReconnect - the user switching the widget on) gets
			// another go with the same login, in case the account itself
			// was what got fixed.
			if (!this.client && this._refused
				&& this._refused.username === username && this._refused.password === password && this._refused.tls === tls
				&& !(options && options.forceReconnect)) {
				this.emit('status', {connected: false, error: this._refused.message});
				return;
			}
			this._refused = null;

			// this.address is the FULL "Cloud:host:port" key this
			// instance was constructed under (see Hardware.js) - logging
			// it (not just the derived host/port) to catch two widgets
			// producing two subtly different key strings for what looks
			// like the same broker (whitespace, casing, etc.), which
			// would create two separate model instances that each pass
			// the guard above independently.
			console.log(prefix, 'connect() called for instance key:', this.address);

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
			var client = this.client = mqtt.connect(url, connectOptions);

			console.log(prefix, 'connecting to', url, '(username: ' + (username || '<none>') + ')');

			this.client.on('connect', function(connack) {
				self.connected = true;
				self.everConnected = true;
				console.log(prefix, 'connected to', url, connack);
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
					self._subscribe(topic);
				});
				self._subscribeBrokerNotices(username);
			});
			this.client.on('reconnect', function() {
				self.connected = false;
				console.log(prefix, 'reconnecting to', url);
				self.emit('status', {connected: false, reconnecting: true});
			});
			this.client.on('close', function() {
				self.connected = false;
				console.log(prefix, 'connection closed:', url);
				self.emit('status', {connected: false});
			});
			this.client.on('error', function(err) {
				self.connected = false;
				console.log(prefix, 'error on', url, '-', String(err && err.message || err));
				self.emit('status', {connected: false, error: String(err && err.message || err)});

				// CONNACK 4/5: bad username/password, not authorized.
				// mqtt.js would otherwise retry the same rejected login
				// every reconnectPeriod forever (found 2026-10-03: "seems
				// hungry in trying to connect all the time") - give up
				// on this client instead; see _refused in connect().
				if (err && (err.code === 4 || err.code === 5) && self.client === client) {
					console.log(prefix, 'login refused - not retrying until the credentials change or the widget is switched on again');
					self._refused = {username: username, password: password, tls: tls, message: String(err.message || err)};
					client.removeAllListeners();
					client.on('error', function() {});
					client.end(true);
					self.client = null;
				}
			});
			this.client.on('message', function(topic, payload) {
				var value = payload.toString();

				// Not data - the broker's own complaint channel (see
				// _subscribeBrokerNotices). Reported broker-wide (no
				// topic), since the notice text isn't in any fixed
				// format that would say which widget's topic it's about.
				if (self._brokerNoticeTopics[topic]) {
					console.log(prefix, 'broker notice on', topic, '-', value);
					// Pin it on one widget's topic when the notice names
					// that topic's feed (longest name first, so "light"
					// doesn't claim a notice about "lighting"); otherwise
					// it's broker-wide.
					var known = _.sortBy(_.keys(self.receiving).concat(_.keys(self.sending)), function(t) { return -t.length; });
					var about = _.find(known, function(t) {
						var feed = t.split('/').pop();
						return feed && value.indexOf(feed) !== -1;
					});
					self._topicError(about || null, value);
					return;
				}

				// First message on this topic since it was (re)subscribed
				// - lets a CloudIn tell "connected and receiving" from
				// "connected, nothing has ever arrived".
				if (!self._topicHasData[topic]) {
					self._topicHasData[topic] = true;
					self.emit('status', {connected: self.connected, topicData: topic});
				}

				// Tracked for set()'s own feedback-loop guard (see the
				// constructor comment) - recorded unconditionally, before
				// anything else, so the guard sees every inbound value
				// regardless of whether it changed this.receiving below.
				self.lastReceivedValue[topic] = value;
				self.lastReceivedAt[topic] = Date.now();

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

			// Feedback-loop guard - see the constructor comment. Skip
			// entirely (don't even update 'sending' or accumulate into
			// the averaging state below) if this exact value was JUST
			// received on this exact topic - almost certainly a value
			// flowing straight back out from a wired CloudIn, not a
			// genuine new value to publish. String() on both sides:
			// lastReceivedValue is always a string (payload.toString()
			// in the 'message' handler), value here is often a raw
			// number from the widget's own field. 2000ms is short
			// relative to the old inbound suppression's 5s window,
			// deliberately - a real feedback loop round-trips through
			// the broker in well under a second, so this only needs to
			// cover that, not "any realistic sendInterval" the way the
			// old check did - a narrower window means less risk of ever
			// skipping a genuine, coincidentally-identical republish
			// from unrelated logic.
			if (String(this.lastReceivedValue[field]) === String(value) && (Date.now() - (this.lastReceivedAt[field] || 0)) < 2000) {
				console.log('[CloudOut] skipping republish of', field, '=', value, '- just received on this same topic (feedback-loop guard)');
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
				console.log('[CloudOut] publishing', field, '=', toSend, '(averaged over', self.pendingCount[field], 'samples, sum:', self.pendingSum[field], ')');
				self.pendingSum[field] = 0;
				self.pendingCount[field] = 0;
				self.lastPublishedValue[field] = String(toSend);
				self.lastPublishedAt[field] = Date.now();
				self._publish(field, String(toSend));
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
					console.log('[CloudOut] settle publish', field, '=', settledValue, '(last published was', self.lastPublishedValue[field], ')');
					self.lastPublishedValue[field] = String(settledValue);
					self.lastPublishedAt[field] = Date.now();
					self._publish(field, String(settledValue));
					self.emit('published', {field: field, value: settledValue});
				}
			}, interval);
		},
		setPollSpeed: function(highLow) {
		},
		// A problem with one TOPIC, as opposed to the connection itself
		// (which the client's own 'error' event covers) - the connection
		// is typically still up, so this rides on 'status' as a separate
		// topicError field rather than as `error`, and carries which
		// topic it's about (null = broker-wide) so only the widget(s)
		// using that topic show it. Added 2026-10-03: a refused
		// subscription or a rejected publish used to fail with nothing
		// shown anywhere but this console.
		_topicError: function(topic, message) {
			console.log('[Cloud] topic error', topic || '(broker-wide)', '-', message);
			this.emit('status', {connected: this.connected, topicError: String(message), topic: topic});
		},
		// MQTT forbids wildcards (and an empty name) in a topic being
		// PUBLISHED to - a broker's answer to one is to drop the whole
		// connection, which would then just look like a flaky network.
		_publish: function(topic, value) {
			var self = this;
			if (!topic || /[#+]/.test(topic)) {
				this._topicError(topic, topic ? 'Invalid publish topic (wildcards # and + are not allowed)' : 'No topic set');
				return;
			}
			// Adafruit IO feed check (see _checkFeed): hold the value
			// while the check is in flight, and never publish to a feed
			// that doesn't exist - Adafruit would silently create it.
			var check = this._feedChecks[topic];
			if (check && check.state === 'pending') {
				check.heldValue = value;
				return;
			}
			if (check && check.state === 'missing') {
				this._topicError(topic, check.message);
				return;
			}
			this.client.publish(topic, value, function(err) {
				if (err) { self._topicError(topic, 'Publish failed: ' + String(err.message || err)); }
			});
		},
		// A broker can refuse a subscription (SUBACK 0x80 - e.g. no
		// permission for that topic) while keeping the connection open;
		// mqtt.js reports that through this callback's err.
		_subscribe: function(topic) {
			var self = this, client = this.client;
			if (!topic) { return; }
			// Nothing has arrived on this topic since THIS subscribe -
			// see the 'message' handler's topicData status.
			this._topicHasData[topic] = false;
			client.subscribe(topic, function(err, granted) {
				// The connection this was sent on has since been closed
				// or replaced (widget switched off, credentials edited) -
				// mqtt.js fails every pending subscribe with "Connection
				// closed" then, which says nothing about the topic.
				if (self.client !== client || !self.connected) { return; }
				var refused = granted && granted[0] && granted[0].qos === 128;
				if (err || refused) {
					self._topicError(topic, 'Subscription refused' + (err ? ': ' + String(err.message || err) : ''));
					return;
				}
				self._requestLastValue(topic);
			});
		},
		// Adafruit IO accepts a subscription to ANY feed name under your
		// account, existing or not, and stays silent either way - a
		// mistyped feed looked exactly like a quiet one (found
		// 2026-10-06: "bad topic not indicated"). It does answer a
		// publish to <feed>/get, though: with the feed's last value on
		// the feed topic if it exists, or with a complaint on
		// <username>/errors if it doesn't. So ask, once per subscribe -
		// which also means a CloudIn shows the current value straight
		// away instead of waiting for the next change. Other brokers
		// have no such request; for them a subscription that has
		// produced nothing yet is reported as just that ("No data yet").
		_requestLastValue: function(topic) {
			if (!this._isAdafruit() || !/^[^\/#+]+\/(feeds|f)\/[^\/#+]+$/.test(topic)) { return; }
			this.client.publish(topic + '/get', '\0');
		},
		// Does this Adafruit IO feed exist? MQTT can't say: Adafruit
		// accepts a subscription to any feed name, and a publish to a
		// feed that doesn't exist CREATES it - so a mistyped feed name in
		// a CloudOut produced no error at all, just a new stray feed
		// (found 2026-10-06: "bad topic not indicated", twice). Its REST
		// API does say, so ask it once when a widget registers a topic:
		// 404 means no such feed. Anything else that isn't a clear "yes"
		// (network error, other status, a non-feed topic, another broker)
		// is treated as "can't tell" and blocks nothing.
		//
		// State per topic in this._feedChecks: 'pending' | 'ok' |
		// 'missing' | 'unknown'. A result is reused for a while - widgets
		// re-register on every value change - but a 'missing' one is
		// re-checked after a few seconds, so creating the feed and
		// switching the widget back on is picked up.
		_checkFeed: function(topic) {
			var self = this;
			var parts = /^([^\/#+]+)\/(?:feeds|f)\/([^\/#+]+)$/.exec(topic || '');
			if (!this._isAdafruit() || !parts || !this._lastPassword) { return; }

			var existing = this._feedChecks[topic];
			if (existing) {
				var age = Date.now() - existing.at;
				if (existing.state === 'pending') { return; }
				if (existing.state === 'missing' ? age < FEED_RECHECK_MISSING_MS : age < FEED_CHECK_REUSE_MS) {
					if (existing.state === 'missing') { this._topicError(topic, existing.message); }
					return;
				}
			}

			var check = this._feedChecks[topic] = {state: 'pending', at: Date.now()};
			this._fetchFeedStatus(parts[1], parts[2], this._lastPassword, function(statusCode) {
				if (self._feedChecks[topic] !== check) { return; }   // superseded
				check.at = Date.now();
				if (statusCode === 404) {
					check.state = 'missing';
					check.message = 'Feed "' + parts[2] + '" does not exist on Adafruit IO';
					delete check.heldValue;
					self._topicError(topic, check.message);
					return;
				}
				check.state = statusCode === 200 ? 'ok' : 'unknown';
				if (check.heldValue !== undefined) {
					var held = check.heldValue;
					delete check.heldValue;
					if (self.client) { self._publish(topic, held); }
				}
			});
		},
		// callback(statusCode), or callback(null) if the request failed.
		// Its own method so tests can replace it.
		_fetchFeedStatus: function(username, feedKey, aioKey, callback) {
			var done = false;
			function finish(code) { if (!done) { done = true; callback(code); } }
			try {
				var request = require('https').get({
					host: 'io.adafruit.com',
					path: '/api/v2/' + encodeURIComponent(username) + '/feeds/' + encodeURIComponent(feedKey),
					headers: {'X-AIO-Key': aioKey},
					timeout: 5000,
				}, function(response) {
					response.resume();
					finish(response.statusCode);
				});
				request.on('timeout', function() { request.destroy(); finish(null); });
				request.on('error', function() { finish(null); });
			}
			catch (e) { finish(null); }
		},
		_isAdafruit: function() {
			return /(^|\.)adafruit\.com$/i.test(String(address));
		},
		// Plain MQTT 3.1.1 has no way to tell a client its QoS-0 publish
		// was rejected (unknown feed, no permission, rate limit) - the
		// message is just dropped. Adafruit IO instead reports those on
		// two per-account topics, <username>/errors and
		// <username>/throttle; listening to them is the only way a
		// wrong feed name there is ever visible. Other brokers have no
		// equivalent, so this is a no-op for them.
		_subscribeBrokerNotices: function(username) {
			this._brokerNoticeTopics = {};
			if (!username || !this._isAdafruit()) { return; }
			var self = this;
			_.each([username + '/errors', username + '/throttle'], function(topic) {
				self._brokerNoticeTopics[topic] = true;
				self.client.subscribe(topic);
			});
		},
		// mode: 'in' registers+subscribes a topic for a CloudIn widget,
		// 'out' just registers a topic as a known publish target for a
		// CloudOut widget (nothing to subscribe to). options carries
		// username/password/tls (see connect() above) - always present
		// on the first call for a given widget (CloudIn.js/CloudOut.js
		// send them on every enableDevice(), not just the first).
		setIOMode: function setIOMode(topic, mode, options) {
			this.connect(options, mode);
			this._checkFeed(topic);

			if (mode == 'in') {
				if (this.receiving[topic] === undefined) {
					this.receiving[topic] = 0;
				}
				if (this.client && this.connected) {
					this._subscribe(topic);
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
