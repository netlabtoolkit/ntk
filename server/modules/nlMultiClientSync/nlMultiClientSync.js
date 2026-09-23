module.exports = function(options) {

	var deviceUpdateThrottleID = undefined;
	var fs = require('fs'),
		_ = require('underscore'),
		events = require('events'),
		nlHardware = require('../nlHardware/Hardware'),
		StandaloneMonitor = require('../nlHardware/StandaloneMonitor'),
		utils = require('../../utils')(),
		self;

	// Active StandaloneMonitor connections, keyed by socket.id - each
	// browser client can have at most one at a time (see
	// client:startMonitor below). Separate from self.hardwareModels
	// (the normal per-device NetworkModel map) since a monitor
	// connection is a fundamentally different thing: it doesn't claim
	// any pins, doesn't go through the Firmata handshake, and belongs
	// to one specific client's UI session, not the shared patch.
	var activeMonitors = {};


	var QueueHandler = utils.QueueHandler;

	// Output-role widget typeIDs - mirrors each widget's own client-side
	// `deviceMode` (see AnalogOut.js/DigitalOut.js/Servo.js/OSCOut.js),
	// which is what picks `active` vs `activeOut` as the flag that
	// actually gates its own connection. The server only ever sees
	// serialized widget JSON (typeID, active, activeOut - see
	// masterPatch.widgets), not the client's view classes, so this list
	// is the server-side equivalent of that same in/out split - needed by
	// pruneHardwareModelIfUnused below, since a widget's `active` field
	// defaults to true forever for every output-role widget (it's simply
	// never touched by that widget's own code - only `activeOut` is),
	// so checking `active` on an output widget would always look "still
	// wanted" even when its connect toggle is off.
	var OUTPUT_TYPE_IDS = {Servo: true, AnalogOut: true, DigitalOut: true, OSCOut: true};

	function widgetWantsConnection(widget) {
		if (!widget) return false;
		return OUTPUT_TYPE_IDS[widget.typeID] ? widget.activeOut === true : widget.active === true;
	}

	// An OSC hardware-model instance opens a real UDP socket on whatever port its key
	// encodes (see nlHardware/OSC.js), so distinct OSCIn widgets configured with distinct
	// receiving ports correctly get distinct instances/sockets - and OSCIn widgets sharing
	// a port correctly share one instance, since equal key strings hash to the same entry.
	// OSCOut has no receiving-port semantics (its own "port" field is an outbound message
	// target, unrelated to any local socket) - see OSCOut.js's getReceivingDeviceKey(),
	// which reports a fixed key here instead of its own configurable target, so it always
	// routes through the same shared instance as a default-configuration OSCIn rather than
	// opening its own redundant listener.


	var MultiClientSync = function(options) {
		_.extend(this, events.EventEmitter.prototype);
		self = this;

		options.transport ? this.transport = options.transport : undefined;
		options.models ? this.hardwareModels = options.models : undefined;

		// Loop through all devices and bind them
		for(var deviceType in this.hardwareModels) {
			this.bindModelToTransport(this.hardwareModels[deviceType]);
		}


		this.masterPatch = [];
		// Starts unlocked (Edit ON) -- must match netlabServer.js's initial `serverActivated`
		this.serverActive = false;

		this.loadPatchFromServer();
		this.transport.on('connection', this.registerClient);

		this.on('notify:serverActive', function(serverActive) {
			this.serverActive = serverActive;
			this.transport.emit('serverActive', serverActive);
		}, this);


		this.queueHandler = new QueueHandler( this.sendNetworkSet.bind(this) );
		this.queueHandler.interval = 30;
		this.queueHandler.next = function() {
			if(this.queue.length > 0) {

				setTimeout(function() {
					// Snapshot-and-clear right here, synchronously, before
					// sendNetworkSet's own per-item staggered sends even
					// start - NOT inside sendNetworkSet itself (that used
					// to compare a snapshot index against this SAME array's
					// live, still-mutating length to decide when to clear,
					// which almost never matched once anything else pushed
					// into the queue while those staggered sends were still
					// pending - e.g. a real device write arriving while a
					// widget's initial connect happened to enqueue a big
					// batch of unrelated fields all at once. Once that
					// match failed, the queue was never cleared, so
					// addToQueue's "queue.length == 0" check (the only
					// thing that ever calls next() again) never passed
					// again either - every write after that point just sat
					// in the queue being silently replaced forever, with no
					// error and nothing to show it wasn't reaching the
					// device. Clearing here instead means whatever's
					// queued NOW gets a real, timely flush, and the queue
					// is genuinely empty again immediately for the next
					// addToQueue call - regardless of how many items were
					// in this batch or what arrives while it's being sent.
					var batch = this.queue.slice();
					this.queue.length = 0;
					this.sendCallback(batch);
				}.bind(this), this.interval);

			}
		};

	};

	MultiClientSync.prototype = {
		clients: [],
		/**
		 * pruneHardwareModelIfUnused - closes and drops a hardware-model
		 * instance (e.g. the NetworkModel/etherport-client behind a
		 * WiFi Firmata device) once no widget currently mapped to it still
		 * wants a live connection.
		 *
		 * Without this, a hardware-model instance - and the real TCP
		 * connection/reconnect-forever loop etherport-client runs behind
		 * it (see NetworkModel.js's own comment on self.close) - only
		 * ever got torn down when a widget was fully REMOVED
		 * (client:removeWidget below), never when a widget's connect
		 * toggle (active/activeOut) simply switched off. That left the
		 * connection silently reconnecting in the background for the
		 * rest of the server process's life, invisible from the UI - a
		 * real bug found 2026-09-19 (NTK connecting to a device on its
		 * own with no widget's toggle showing anything active).
		 *
		 * @param {string} hardwareKey e.g. "network:192.168.0.116:3030"
		 * @return {void}
		 */
		pruneHardwareModelIfUnused: function(hardwareKey) {
			var model = this.hardwareModels[hardwareKey];
			if (!model) return;

			var mappedWidgetIds = _.pluck(_.where(this.masterPatch.mappings, {modelWID: hardwareKey}), 'viewWID');
			var stillWanted = _.some(mappedWidgetIds, function(wid) {
				var widget = _.findWhere(this.masterPatch.widgets, {wid: wid});
				return widgetWantsConnection(widget);
			}, this);

			if (!stillWanted) {
				if (typeof model.close === 'function') {
					model.close();
				}
				delete this.hardwareModels[hardwareKey];
			}
		},
		/**
		 * pruneOrphanedHardwareModels - closes and drops every
		 * hardware-model instance no longer referenced by
		 * this.masterPatch.mappings (call AFTER masterPatch is updated
		 * to reflect its new state).
		 *
		 * Was previously inlined into client:removeWidget's handler
		 * only, which meant removing a single widget correctly closed
		 * its now-orphaned connection but clearing/loading an entire
		 * new patch (loadPatchFile - used by BOTH Clear Patch and
		 * Import) did not: it only ever replaced masterPatch via
		 * setMaster(), with no equivalent cleanup step, so a device
		 * NTK had been actively driving stayed connected (status LED
		 * staying solid, no "waiting for connection") until the whole
		 * app quit and tore the process down - found via hands-on
		 * testing 2026-09-22.
		 *
		 * @return {void}
		 */
		pruneOrphanedHardwareModels: function() {
			var stillReferencedKeys = _.pluck(this.masterPatch.mappings, 'modelWID');
			for(var key in this.hardwareModels) {
				if(!_.contains(stillReferencedKeys, key)) {
					var model = this.hardwareModels[key];
					if(typeof model.close === 'function') {
						model.close();
					}
					delete this.hardwareModels[key];
				}
			}
		},
		setMaster: function(patch) {
			this.masterPatch = patch;
			self.transport.sockets.emit('loadPatchFromServer', JSON.stringify( patch ));
		},
		/**
		 * Add any changes to the master model reference (with no events emitted from this function)
		 *
		 * @param {object} changes
		 * @return {void}
		 */
		updateMaster: function(changes) {
			for(var i=changes.length-1; i >=0; i--) {
				var currentModel = changes[i];
				var masterModel = _.findWhere(this.masterPatch.widgets, {wid: currentModel.wid});
				if(masterModel) {
					_.extend(masterModel, currentModel.changedAttributes);
				}
			}
		},
		updateMappings: function(changes, socket) {
			var currentMap = JSON.parse( changes );
			var masterModel = _.findWhere(this.masterPatch.mappings, {viewWID: currentMap.wid});

			if(masterModel) {
				masterModel.map = currentMap.mappings[0].map;
				// Real bug, found 2026-09-22: this used to re-broadcast
				// the ENTIRE masterPatch (widgets included) just to sync
				// a mappings-only change. The sending client already has
				// the correct mapping state locally (it computed and
				// sent it) - a full reload back to it could race any
				// OTHER in-flight update for the same widget and clobber
				// it with stale masterPatch.widgets data. This race is a
				// real, confirmed bug on its own (verified via a captured
				// stack trace showing exactly this path reconstructing a
				// widget from stale server data) - but it turned out NOT
				// to be the full explanation for a separate "editing a
				// hardware widget's IP then reconnecting reverts to the
				// old value" symptom seen the same day, which persisted
				// even with this fix in place. That symptom's real cause
				// was found the next day: a global parseInt() truncation
				// bug in the rivets<->Backbone adapter (app/scripts/
				// main.js) was silently dropping the IP field's edit
				// before it ever reached the model - see
				// ntk_hardware_ip_edit_revert_open_bug memory. No other
				// client needs a widget-including reload just because
				// one mapping changed, regardless.
			}

		},
		/**
		 * Binds a hardware model to the front-end
		 * Listens to the model 'change' event and brodcasts that change to all clients
		 *
		 * @param model
		 * @return {void}
		 */
		bindModelToTransport: function(model) {
			// Listen for changes made on the hardware to update the front-end
			// model.address is the exact key this instance was created under (see
			// nlHardware/Hardware.js), so broadcasting under it always reaches whichever
			// client-side hardwareModelInstances entry (same key) the change came from -
			// for OSC in particular, that's now the widget's real configured receiving port.
			model.on('change', function(options) {
				this.transport.emit('receivedModelUpdate', JSON.stringify({modelType: model.address, field: options.field, value: options.value}));
			}.bind(this));

			// A bad/unset IP (or an unreachable device generally) used
			// to fail completely silently - see NetworkModel.js's own
			// comment on connectionFailed for the full story. Broadcast
			// to every connected client rather than routing to just
			// whichever socket happened to trigger the connection - NTK
			// has no per-socket ownership of a hardware model, and every
			// connected browser client cares equally that this device
			// isn't reachable.
			model.on('connectionFailed', function(info) {
				this.transport.emit('server:hardwareConnectionFailed', info);
			}.bind(this));
		},
		/**
		 * Loads a patch from a file and sets the patch as our master model reference
		 *
		 * @return {void}
		 */
		loadPatchFromServer: function() {
      var patchFileName = self.getPatchPath();

			// Read the currently stored patch file and push it to the client
			fs.exists(patchFileName, function(exists) {
				if(exists) {
					self.loadFileIntoMasterPatch(patchFileName);
				}
				else {
					// Create the file then load it
					fs.writeFile(patchFileName, '{"widgets":[],"mappings":[]}', function(err) {
						self.loadFileIntoMasterPatch(patchFileName);
					});
				}
			});


		},
		loadFileIntoMasterPatch: function loadFileIntoMasterPatch(patchFileName) {
			fs.readFile(patchFileName, 'utf8', function (err, data) {
				if (err) {
					console.log('Error: ' + err);
          data = '{"widgets":[],"mappings":[]}';
					//return;
				}

				self.setMaster(JSON.parse(data));
			});
		},
		/**
		 * Bind to all events coming from the client
		 *
		 * @param {Socket} socket
		 * @return {void}
		 */
		registerClient: function(socket) {

			socket.emit('serverActive', self.serverActive);
			socket.emit('loadPatchFromServer', JSON.stringify(self.masterPatch));
			socket.on('sendModelUpdate', function(options) {

				var typeAddressPort = options.modelType.split(':');
				var modelType = typeAddressPort[0];
				var hardwareKey = options.modelType;

				for(var field in options.model) {
					//var selectedModel = self.hardwareModels[modelType];
					var selectedModel = self.hardwareModels[hardwareKey];
					var networkDevice = typeAddressPort[1].match(/^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/);


					if(typeAddressPort[1] == "127.0.0.1") {
						networkDevice = false;
					}


					// If there is no model to update, try to instantiate one
					if(selectedModel == undefined) {

						//self.hardwareModels[modelType] = new nlHardware({deviceType: typeAddressPort[0], address: typeAddressPort[1], port: typeAddressPort[2] }).model;
						self.hardwareModels[hardwareKey] = new nlHardware({deviceType: hardwareKey, address: typeAddressPort[1], port: typeAddressPort[2] }).model;

						console.log('MAKING NEW ', hardwareKey, self.hardwareModels[hardwareKey].type, self.hardwareModels);
						self.bindModelToTransport(self.hardwareModels[hardwareKey]);
						self.hardwareModels[hardwareKey].set(field, parseInt(options.model[field], 10), options.modeRequested);
					}
					else {
						// Extra throttling for network latency
						if(networkDevice) {
							if(deviceUpdateThrottleID !== undefined) {
								clearTimeout(deviceUpdateThrottleID);
							}

							self.queueHandler.addToQueue({field: field, value: parseFloat(options.model[field], 10), model: selectedModel, modeRequested: options.modeRequested});
						}
						else {
							selectedModel.set(field, parseFloat(options.model[field], 10), options.modeRequested);
						}
					}
				}
			});

			// Enumerate currently connected serial ports, for the Serial device port picker
			socket.on('client:listSerialPorts', function() {
				require('serialport').list().then(function(ports) {
					socket.emit('serialPortList', ports);
				}).catch(function(err) {
					socket.emit('serialPortList', []);
				});
			});

			// Allow the front-end to switch IO modes on the device
			socket.on('client:changeIOMode', function(options) {
				var options = JSON.parse(options),
					modelType = options.deviceType;

				if(options.port && options.mode) {
					// A widget can ask to switch a pin's mode (e.g. DigitalIn
					// right after being created) before its own
					// sendDeviceModelUpdate has round-tripped through
					// SocketAdapter's throttle and actually created the
					// hardware model below - instantiate it here too if
					// needed, same as sendModelUpdate does, so this doesn't
					// silently no-op on that race.
					if(self.hardwareModels[modelType] == undefined) {
						var typeAddressPort = modelType.split(':');
						self.hardwareModels[modelType] = new nlHardware({deviceType: modelType, address: typeAddressPort[1], port: typeAddressPort[2] }).model;
						self.bindModelToTransport(self.hardwareModels[modelType]);
					}

					// 3rd arg carries anything beyond port/mode a specific
					// mode needs - e.g. GroveSensor's "needs_pin" sensors
					// (see StandardFirmataModel.js's setIOMode) include
					// which physical pin they're wired to. Every other
					// mode just ignores it.
					self.hardwareModels[modelType].setIOMode(options.port, options.mode, options);
				}

			});

			// Push/pull the standalone patch (see plans/standalone-
			// patch-export.md's "Push/Pull standalone patch" section) -
			// v1 assumes one device per patch, so Patcher.js's caller
			// already resolved which hardwareKey to target
			// (getActiveNetworkDeviceKey) before either of these fire.
			// A missing hardwareModel here means the device was never
			// actually connected (shouldn't happen - the client only
			// offers Push/Pull when it IS - but reported cleanly rather
			// than throwing if it somehow does).
			socket.on('client:pushPatchToDevice', function(data) {
				var options = JSON.parse(data);
				var hardwareModel = self.hardwareModels[options.hardwareKey];
				if(!hardwareModel) {
					socket.emit('server:pushPatchResult', {ok: false, error: 'Device is not connected.'});
					return;
				}
				if(typeof hardwareModel.pushPatch !== 'function') {
					socket.emit('server:pushPatchResult', {ok: false, error: 'This device type doesn\'t support Push/Pull.'});
					return;
				}
				hardwareModel.pushPatch(options.patch, function(ok, errorMessage) {
					socket.emit('server:pushPatchResult', {ok: ok, error: errorMessage});
				});
			});

			socket.on('client:pullPatchFromDevice', function(data) {
				var options = JSON.parse(data);
				var hardwareModel = self.hardwareModels[options.hardwareKey];
				if(!hardwareModel) {
					socket.emit('server:pullPatchResult', {patch: null, error: 'Device is not connected.'});
					return;
				}
				if(typeof hardwareModel.pullPatch !== 'function') {
					socket.emit('server:pullPatchResult', {patch: null, error: 'This device type doesn\'t support Push/Pull.'});
					return;
				}
				hardwareModel.pullPatch(function(patchJson, errorMessage) {
					socket.emit('server:pullPatchResult', {patch: patchJson, error: errorMessage});
				});
			});

			// New responder. Anytime a widget changes, notify all other clients
			socket.on('client:sendModelUpdate', function(options) {
				var wid = options.wid,
					changedAttributes = options.changedAttributes;

				self.updateClients([{wid: wid, changedAttributes: changedAttributes}], this);

				// A widget's connect toggle just switched off - check
				// whether any hardware connection it was mapped to should
				// now be closed (see pruneHardwareModelIfUnused above).
				// Runs after updateClients so masterPatch.widgets already
				// reflects this change.
				if (changedAttributes && (changedAttributes.active === false || changedAttributes.activeOut === false)) {
					var deactivatedHardwareKeys = _.pluck(_.where(self.masterPatch.mappings, {viewWID: wid}), 'modelWID');
					_.each(deactivatedHardwareKeys, function(hardwareKey) {
						self.pruneHardwareModelIfUnused(hardwareKey);
					});
				}
			});

			// When we receive an update to the mappings from the client
			socket.on('client:sendSourceMappingUpdate', function(options) {
				self.updateMappings(options, socket);
			});

			socket.on('client:removeWidget', function(wid) {
				self.masterPatch.widgets = _.reject(self.masterPatch.widgets, function(view) { return wid === view.wid; });
				this.broadcast.emit('loadPatchFromServer', JSON.stringify(self.masterPatch));

				// Release any hardware-model instance (e.g. an OSC listening socket) that no
				// widget references any more - the client already removed this widget's own
				// mappings (see Patcher.js's removeWidget) before sending this event, so
				// masterPatch.mappings reflects what's still in use.
				self.pruneOrphanedHardwareModels();
			});

			socket.on('client:addWidget', function(view) {
				self.masterPatch.widgets.push(JSON.parse(view));
				this.broadcast.emit('loadPatchFromServer', JSON.stringify(self.masterPatch));
			});

			socket.on('client:updateModelMappings', function(mappings) {
				// We should do the below in the future instead to limit traffic
				//self.masterPatch.mappings.push(JSON.parse(mappings));
				self.masterPatch.mappings = JSON.parse(mappings);
				// No broadcast back - see updateMappings's own comment
				// for the race condition this caused and its real but
				// limited fix (a separate, now also-resolved "IP edit
				// reverts" bug - see ntk_hardware_ip_edit_revert_open_bug
				// memory). The sending client already has the correct
				// mapping state locally.

				// Separately: this is exactly where changing a widget's
				// server/IP (not removing the whole widget) leaves its
				// OLD hardware connection orphaned - masterPatch.mappings
				// now reflects the new address, so the old hardwareKey
				// is no longer referenced and this correctly closes it.
				// Without this, the old connection just kept retrying
				// forever in the background - harmless on its own,
				// except its eventual connectionFailed report (see
				// NetworkModel.js) could still arrive later and show the
				// wrong (old) address. This part IS confirmed working.
				self.pruneOrphanedHardwareModels();
			});

			socket.on('saveCurrentPatch', function(options) {
				self.loadPatch(JSON.parse(options));
			});
			socket.on('client:clearPatch', function(options) {
				self.loadPatchFile(options);
			});

			socket.on('client:toggleServer', function() {
				self.emit('toggleServer');
			});

			// Opt-in "monitor mode" (see plans/standalone-patch-export.md
			// and the firmware-monitor-mode branch history) - watches a
			// running standalone patch's live values without taking over
			// from it. One monitor connection per browser client/socket
			// at a time - a second client:startMonitor from the same
			// socket replaces whatever it already had running, same as
			// the reasoning for keying activeMonitors by socket.id below.
			socket.on('client:startMonitor', function(options) {
				var existing = activeMonitors[socket.id];
				if (existing) {
					existing.close();
					delete activeMonitors[socket.id];
				}

				var host = options.host,
					port = options.port;

				function connectMonitor() {
					var monitor = StandaloneMonitor(host, port);
					activeMonitors[socket.id] = monitor;

					monitor.on('connected', function() {
						socket.emit('server:monitorStatus', {connected: true, host: host, port: port});
					});
					monitor.on('value', function(update) {
						socket.emit('server:monitorValue', [update]);
					});
					monitor.on('error', function(err) {
						socket.emit('server:monitorStatus', {connected: false, error: String(err)});
					});
					monitor.on('close', function() {
						socket.emit('server:monitorStatus', {connected: false});
						if (activeMonitors[socket.id] === monitor) {
							delete activeMonitors[socket.id];
						}
					});
				}

				// A NORMAL (non-monitoring) hardware connection to this
				// SAME device - e.g. auto-opened because the imported
				// patch's widgets were saved with active:true - has to be
				// closed first. The device only ever calls accept() again
				// once its current connection disconnects (its own
				// monitor-request peek only runs right after a fresh
				// accept()), so without this, the monitor connection just
				// sits unaccepted in the OS-level listen() backlog
				// forever: our own socket still sees 'connected' fire (a
				// raw TCP handshake alone succeeds against that backlog
				// slot) and the banner shows, but the device's console
				// never logs a monitor connection and no values ever
				// arrive - found via hands-on testing 2026-09-22.
				var hardwareKey = 'network:' + host + ':' + port;
				var existingHardwareModel = self.hardwareModels[hardwareKey];
				if (existingHardwareModel) {
					if (typeof existingHardwareModel.close === 'function') {
						existingHardwareModel.close();
					}
					delete self.hardwareModels[hardwareKey];
					// The disconnect has to actually reach the device (a
					// real WiFi round trip) and its own accept loop has to
					// notice before it's ready for a new connection -
					// racing that with an immediate reconnect risked the
					// exact same silently-queued-and-ignored outcome this
					// is fixing. 500ms is comfortably more than the
					// device's own sub-100ms per-connection poll interval.
					setTimeout(connectMonitor, 500);
				} else {
					connectMonitor();
				}
			});

			socket.on('client:stopMonitor', function() {
				var existing = activeMonitors[socket.id];
				if (existing) {
					existing.close();
					delete activeMonitors[socket.id];
				}
			});

			socket.on('disconnect', function() {
				var existing = activeMonitors[socket.id];
				if (existing) {
					existing.close();
					delete activeMonitors[socket.id];
				}
				self.emit('clientDisconnected');
			});

		},
		sendNetworkSet: function(fieldValues) {
			// fieldValues is now a private snapshot (see next()'s
			// snapshot-and-clear) - no need to touch the live queue here
			// at all, so each item's staggered send is independent of
			// whatever's been queued since this batch was taken.
			for(var i=fieldValues.length-1; i >= 0; i--) {

				var closedFunction = function(i) {
					return function() {
						var field = fieldValues[i].field,
							value = fieldValues[i].value,
							modeRequested = fieldValues[i].modeRequested,
							model = fieldValues[i].model;

						model.set(field, value, modeRequested);
					}
				};

				closedFunction = closedFunction(i);

				setTimeout(closedFunction, 30*(i+1));
			}

		},
		loadPatch: function(options) {
			var patch = options.patch;
			var patchFileName = self.getPatchPath();

			self.setMaster(patch);

			fs.writeFile(patchFileName, JSON.stringify(patch), function(err) {
				if(err) {
					console.log(err);
				}
				else {
					//self.setMaster(JSON.parse(patch));
					console.log('file saved');

				}
			});
		},
		loadPatchFile: function(options) {
			var patch = JSON.parse(options).patch;

			self.setMaster(patch);
			// Used by both Clear Patch and Import - either can drop or
			// replace widgets that were the only thing still referencing
			// a live hardware connection (see pruneOrphanedHardwareModels's
			// own docstring for how this was found).
			self.pruneOrphanedHardwareModels();
		},
		/**
		 * Update all registered clients with a set of changes
		 *
		 * @param {object} changes
		 * @param {Socket} socket
		 * @return {void}
		 */
		updateClients: function(changes, socket) {

			// Check if there are any changes
			var i = changes.length-1,
				changesExist = false;

			// Check if any changes were actually passed to this function
			while(i >= 0) {
				if(changes[i] && changes[i].changedAttributes !== false) {
					changesExist = this.areChangesNew(changes[i]);
					if(changesExist) {
						// short circuit the while loop if we found one
						i = -1;
					}
				}

				i--;
			}

			// If we have a set of changes passed
			if(changesExist) {

				// Update the master model reference and then update the clients
				this.updateMaster(changes);
				if(socket) {
					socket.broadcast.emit('server:clientModelUpdate', changes);
				}
				else {
					this.transport.emit('server:clientModelUpdate', changes);
				}
			}
		},
		areChangesNew: function(widgetChanges) {
			var masterWidget = _.findWhere(this.masterPatch.widgets, {wid: widgetChanges.wid}),
				changesExist = false;

			if(masterWidget) {
				var changedAttributes = widgetChanges.changedAttributes;

				for(var attribute in changedAttributes) {
					// Casting should be fine here since we are dealing with strings converted to numbers, etc. No double equal used for that reason.
					if(masterWidget[attribute] != changedAttributes[attribute]) {
						changesExist = true;
					}
				}
			}
			else {
				// if we don't find a master widget, then it is a new widget and therefore changes are new
				changedExist = true;
			}

			return changesExist;
		},
    getPatchPath: function() {
      var commandLineDir = "server/modules/nlMultiClientSync";
      var str = __dirname.substr(-1*(commandLineDir.length));

      if (str == commandLineDir) { // running from the command line
        return __dirname + '/../../currentPatch.ntk';
      }
      else if (process.versions.electron) {
        // A packaged build runs out of app.asar, a read-only archive - writing
        // "into" it (e.g. __dirname + '/../../currentPatch.ntk') silently fails
        // (ENOTDIR), so save/load never actually persist. Use Electron's real
        // per-user writable data directory instead.
        return require('electron').app.getPath('userData') + '/currentPatch.ntk';
      }
      else { // running from the built app package outside Electron (e.g. plain node)
        return __dirname + '/../../currentPatch.ntk';
      }
    }
	};

	return new MultiClientSync(options);
};
