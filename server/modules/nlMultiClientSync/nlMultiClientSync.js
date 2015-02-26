module.exports = function(options) {

	var fs = require('fs'),
		_ = require('underscore'),
		self;

	var MultiClientSync = function(options) {
		options.transport ? this.transport = options.transport : undefined;
		options.model ? this.model = options.model : undefined;
		this.model && this.bindModelToTransport(this.model);
		this.masterPatch = [];

		this.loadPatchFromServer();
		this.transport.on('connection', this.registerClient);
		self = this;

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
				//socket.broadcast.emit('server:clientMappingUpdate', JSON.stringify( masterModel ));
			}

		},
		/**
		 * Binds a hardware model to the front-end
		 * Listends to the model 'change' event and brodcasts that change to all clients
		 *
		 * @param model
		 * @return {void}
		 */
		bindModelToTransport: function(model) {
			// Listen for changes made on the hardware to update the front-end
			model.on('change', function(options) {
				self.transport.emit('receivedModelUpdate', {modelType: model.type, field: options.field, value: options.value});
			});
		},
		/**
		 * Loads a patch from a file and sets the patch as our master model reference
		 *
		 * @return {void}
		 */
		loadPatchFromServer: function() {
			var patchFileName = __dirname + '/currentPatch.nlp';

			// Read the currently stored patch file and push it to the client
			fs.readFile(patchFileName, 'utf8', function (err, data) {

				if (err) {
					console.log('Error: ' + err);
					return;
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

			socket.emit('loadPatchFromServer', JSON.stringify(self.masterPatch));
			socket.on('sendModelUpdate', function(options) {
				for(var field in options.model) {
					if(self.model.outputs[field] !== undefined) {
						self.model.set(field, parseInt(options.model[field], 10));
					}
				}
			});

			// Allow the front-end to switch IO modes on the device
			socket.on('client:changeIOMode', function(options) {
				var options = JSON.parse(options);

				if(options.port && options.mode) {
					self.model.setIOMode(options.port, options.mode);
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
				self.loadPatch(options);
			});
			socket.on('client:clearPatch', function(options) {
				self.loadPatchFile(options);
			});

		},
		loadPatch: function(options) {
			var patch = options.patch;
			var patchFileName = __dirname + '/currentPatch.nlp';

			fs.writeFile(patchFileName, patch, function(err) {
				if(err) {
					console.log(err);
				}
				else {
					self.setMaster(JSON.parse(patch));
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
		}
	};

	return new MultiClientSync(options);
};
