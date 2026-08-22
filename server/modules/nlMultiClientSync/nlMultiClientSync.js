module.exports = function(options) {

	var deviceUpdateThrottleID = undefined;
	var fs = require('fs'),
		_ = require('underscore'),
		events = require('events'),
		nlHardware = require('../nlHardware/Hardware'),
		utils = require('../../utils')(),
		self;


	var QueueHandler = utils.QueueHandler;

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
					this.sendCallback(this.queue);

					//this.queue.length = 0;
				}.bind(this), this.interval);

			}
		};

	};

	MultiClientSync.prototype = {
		clients: [],
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
				socket.broadcast.emit('loadPatchFromServer', JSON.stringify(self.masterPatch));
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
					//if(self.hardwareModels[modelType] == undefined) {
						//var typeAndAddress = modelType.split(':');
						//self.hardwareModels[modelType] = new nlHardware({deviceType: typeAndAddress[0], address: typeAndAddress[1] }).model;
						//self.bindModelToTransport(self.hardwareModels[modelType]);

						//self.hardwareModels[modelType].setIOMode(options.port, options.mode);
					//}
					//else {
					if(self.hardwareModels[modelType] !== undefined) {
						self.hardwareModels[modelType].setIOMode(options.port, options.mode);
					}
					//}
				}

			});

			// New responder. Anytime a widget changes, notify all other clients
			socket.on('client:sendModelUpdate', function(options) {
				var wid = options.wid,
					changedAttributes = options.changedAttributes;

				self.updateClients([{wid: wid, changedAttributes: changedAttributes}], this);
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
				var stillReferencedKeys = _.pluck(self.masterPatch.mappings, 'modelWID');
				for(var key in self.hardwareModels) {
					if(!_.contains(stillReferencedKeys, key)) {
						var model = self.hardwareModels[key];
						if(typeof model.close === 'function') {
							model.close();
						}
						delete self.hardwareModels[key];
					}
				}
			});

			socket.on('client:addWidget', function(view) {
				self.masterPatch.widgets.push(JSON.parse(view));
				this.broadcast.emit('loadPatchFromServer', JSON.stringify(self.masterPatch));
			});

			socket.on('client:updateModelMappings', function(mappings) {
				// We should do the below in the future instead to limit traffic
				//self.masterPatch.mappings.push(JSON.parse(mappings));
				self.masterPatch.mappings = JSON.parse(mappings);
				this.broadcast.emit('loadPatchFromServer', JSON.stringify(self.masterPatch));
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

			socket.on('disconnect', function() {
				self.emit('clientDisconnected');
			});

		},
		sendNetworkSet: function(fieldValues) {
			for(var i=fieldValues.length-1; i >= 0; i--) {

				var closedFunction = function(i) {
					return function() {
						var field = fieldValues[i].field,
							value = fieldValues[i].value,
							modeRequested = fieldValues[i].modeRequested,
							model = fieldValues[i].model;

						model.set(field, value, modeRequested);

						if(i == self.queueHandler.queue.length-1) {
							self.queueHandler.queue.length = 0;
						}

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
