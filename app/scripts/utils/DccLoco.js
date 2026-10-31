define([
	'underscore',
],
function(_){
	'use strict';

	/**
	 * DccLoco - what every DCC widget that works on one loco shares
	 * (DCC Throttle, DCC Function): the station / port / loco settings,
	 * mapping to the station's session (server/modules/nlHardware/
	 * WiThrottleModel.js), taking and releasing the loco, sending to it,
	 * the station's reports and the status dot / line.
	 *
	 * Mixed into a widget with _.extend. The widget calls initDcc() in
	 * initialize (before its own model.set), dccRegisterFormatters() in
	 * onRender, dccSettingsChanged() from onModelChange and dccSetFromModel()
	 * from setFromModel; it receives the station's reports for its loco
	 * in onLocoReport(what, value) and may add to the status in
	 * dccReadyStatus(loco, info).
	 */

	// Same rule as the server's withrottle.js: S for 1-127, L above.
	function locoKey(address) {
		var n = Number(address);
		if(!(n >= 1 && n <= 10239) || Math.floor(n) !== n) { return null; }
		return (n <= 127 ? 'S' : 'L') + n;
	}

	var DccLoco = {
		locoKey: locoKey,

		initDcc: function() {
			this.lastStatusInfo = null;
			this.acquired = false;
			// The loco this widget holds, and on which station - kept, so
			// it's let go of there even after the address fields change.
			this.heldKey = null;
			this.heldStation = null;

			var get = this.model.get.bind(this.model);
			var keep = function(name, fallback) { return get(name) === undefined ? fallback : get(name); };
			this.model.set({
				// Off until switched on - nothing connects before that.
				active: keep('active', false),
				stationHost: keep('stationHost', 'simulated'),
				stationPort: keep('stationPort', 2560),
				loco: keep('loco', 3),
				statusKind: 'idle',
				statusText: 'loco ' + keep('loco', 3) + ' · off',
				statusTitle: 'Switch on (checkbox) to connect',
				powerOff: false,
			});

			this.onHardwareStatus = function(data) {
				if(data.modelType !== this.getStationKey()) { return; }
				this.lastStatusInfo = data.info || null;
				this.updateStatus();
			}.bind(this);
			window.app.vent.on('hardwareStatus', this.onHardwareStatus);

			this.onDeviceUpdate = function(data) {
				data = typeof data === 'string' ? JSON.parse(data) : data;
				if(data.modelType !== this.heldStation) { return; }
				var parts = /^([SL]\d+):(\w+)$/.exec(data.field || '');
				if(!parts || parts[1] !== this.heldKey) { return; }
				if(parts[2] === 'acquired') {
					this.acquired = Number(data.value) === 1;
					this.updateStatus();
					return;
				}
				this.onLocoReport(parts[2], Number(data.value));
			}.bind(this);
			window.app.vent.on('receivedDeviceModelUpdate', this.onDeviceUpdate);
		},

		removeDcc: function() {
			this.releaseLoco();
			window.app.vent.off('hardwareStatus', this.onHardwareStatus);
			window.app.vent.off('receivedDeviceModelUpdate', this.onDeviceUpdate);
		},

		// Must run before WidgetView.prototype.onRender - see CLAUDE.md's
		// Rivets/Backbone gotcha.
		dccRegisterFormatters: function(rivets) {
			rivets.formatters.isDccStatus = function(value, expected) {
				return value === expected;
			};
		},

		getStationHost: function() {
			return String(this.model.get('stationHost') || '').trim() || 'simulated';
		},
		getStationPort: function() {
			return parseInt(this.model.get('stationPort'), 10) || 2560;
		},
		getStationKey: function() {
			return 'WiThrottle:' + this.getStationHost() + ':' + this.getStationPort();
		},
		getLocoKey: function() {
			return locoKey(parseInt(this.model.get('loco'), 10));
		},

		/**
		 * remapStation - map this widget to its station's session, so the
		 * server keeps it open while the widget is on; if on, take the
		 * loco (mapToModel calls enableDevice). Like Encoder's
		 * remapEncoder, the mapping is made whether or not it's on.
		 *
		 * @return {void}
		 */
		remapStation: function(loading) {
			window.app.Patcher.Controller.mapToModel({
				view: this,
				modelType: 'WiThrottle',
				IOMapping: {sourceField: 'station', destinationField: 'stationLink'},
				server: this.getStationHost() + ':' + this.getStationPort(),
			}, true);
			// See Encoder.js's remapEncoder: mapToModel(..., true) doesn't
			// tell the server, which would close the session as unused.
			if(!loading) {
				window.app.vent.trigger('updateModelMappings', window.app.Patcher.Controller.widgetMappings);
			}
			this.updateStatus();
		},

		// Called by mapToModel when the widget is on.
		enableDevice: function enableHardware() {
			var key = this.getLocoKey();
			if(!key) {
				this.updateStatus();
				return;
			}
			if(this.heldKey && (this.heldKey !== key || this.heldStation !== this.getStationKey())) {
				this.releaseLoco();
			}
			this.heldKey = key;
			this.heldStation = this.getStationKey();
			window.app.vent.trigger('Widget:hardwareSwitch', {
				deviceType: this.heldStation,
				port: key,
				mode: 'acquire',
				wid: this.model.get('wid'),
			});
			this.updateStatus();
		},

		releaseLoco: function() {
			if(!this.heldKey) { return; }
			window.app.vent.trigger('Widget:hardwareSwitch', {
				deviceType: this.heldStation,
				port: this.heldKey,
				mode: 'release',
				wid: this.model.get('wid'),
				// A Throttle stops its train when it lets go, even if a
				// DCC Function still holds the loco.
				stop: !!this.stopOnRelease,
			});
			this.heldKey = null;
			this.heldStation = null;
			this.acquired = false;
			this.updateStatus();
		},

		/**
		 * dccMonitored - Monitor mode is showing this widget's values
		 * from a board running the patch. The board is driving the train
		 * then; its values arrive like a cable's (updateNoTrigger), and
		 * acting on them would send every step and stop a second time.
		 */
		dccMonitored: function() {
			var monitoring = window.app.monitoring;
			return !!(monitoring && monitoring.active && monitoring.wids && monitoring.wids[this.model.get('wid')]);
		},

		sendToLoco: function(what, value) {
			if(!this.model.get('active') || !this.heldKey || this.dccMonitored()) { return; }
			var update = {};
			update[this.heldKey + ':' + what] = value;
			window.app.vent.trigger('sendDeviceModelUpdate', {modelType: this.heldStation, model: update});
		},

		// "power off - click to turn on": a throttle alone can then drive
		// a train, without a DCC Station widget in the patch.
		dccStatusClicked: function(e) {
			if(!this.model.get('powerOff') || !this.model.get('active')) { return; }
			e.preventDefault();
			window.app.vent.trigger('sendDeviceModelUpdate', {modelType: this.getStationKey(), model: {power: 1}});
		},

		updateStatus: function() {
			var info = this.lastStatusInfo || {};
			var loco = this.getLocoKey() ? 'loco ' + parseInt(this.model.get('loco'), 10) : null;
			var s = {kind: 'idle', text: 'off', title: 'Switch on (checkbox) to connect', powerOff: false};

			if(!loco) {
				s = {kind: 'error', text: 'bad loco address', title: 'The loco address must be 1-10239', powerOff: false};
			}
			else if(!this.model.get('active')) {
				s.text = loco + ' · off';
				s.title = loco + ' (set in more) - switch on (checkbox) to connect';
			}
			else if(info.error && !info.connected) {
				s = {kind: 'error', text: 'no station', title: info.error + ' - trying again every few seconds', powerOff: false};
			}
			else if(!info.connected) {
				s = {kind: 'waiting', text: 'connecting', title: 'Connecting to ' + this.getStationHost(), powerOff: false};
			}
			else if(!this.acquired) {
				s = {kind: 'waiting', text: 'getting ' + loco, title: 'Asking the station for ' + loco, powerOff: false};
			}
			else if(info.power === 0) {
				// Connected and holding the loco - only power is missing.
				// Not 'waiting': its pulse read as "still connecting".
				s = {kind: 'power', text: 'power off', title: 'Connected, but track power is off - click to turn it on', powerOff: true};
			}
			else {
				s = {kind: 'ok', text: loco + (info.simulated ? ' (sim)' : ''),
					title: loco + (info.simulated ? ' on the simulated station' : ' on ' + this.getStationHost()), powerOff: false};
			}

			this.model.set({statusKind: s.kind, statusText: s.text, statusTitle: s.title, powerOff: s.powerOff});
		},

		/**
		 * dccSettingsChanged - station, loco and on / off changes, from
		 * onModelChange. Returns true when the loco changed.
		 */
		dccSettingsChanged: function(changed) {
			var loading = window.app.Patcher && window.app.Patcher.Controller && window.app.Patcher.Controller.loadingPatch;
			var locoChanged = false;

			// A different station is a different session: switch off, so
			// nothing reconnects while the address is still being typed.
			if(changed.stationHost !== undefined || changed.stationPort !== undefined) {
				if(this.heldKey) { this.releaseLoco(); }
				this.lastStatusInfo = null;
				if(this.model.get('active')) {
					this.model.set('active', false);
				}
				else if(!loading) {
					this.remapStation();
				}
			}

			if(changed.loco !== undefined) {
				locoChanged = true;
				this.acquired = false;
				if(this.model.get('active') && !loading) { this.enableDevice(); }
				this.updateStatus();
			}

			if(changed.active !== undefined && !loading) {
				if(changed.active) {
					this.remapStation();
				}
				else {
					this.releaseLoco();
					this.lastStatusInfo = null;
					this.updateStatus();
				}
			}

			return locoChanged;
		},

		/**
		 * dccSetFromModel - loading a saved patch. PatchLoader then
		 * restores the station mapping, which takes the loco if the
		 * widget was saved switched on.
		 */
		dccSetFromModel: function(model) {
			this.$el.css({top: model.offsetTop, left: model.offsetLeft});
			this.model.set(model);
			this.updateStatus();
		},
	};

	return DccLoco;
});
