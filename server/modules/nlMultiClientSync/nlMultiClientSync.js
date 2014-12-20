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
			this.broadcast('loadPatchFromServer', patch);
		},
		updateMaster: function(changes) {
			for(var i=changes.length-1; i >=0; i--) {
				var currentModel = changes[i];
				var masterModel = _.findWhere(this.masterPatch.widgets, {wid: currentModel.wid});
				if(masterModel) {
					_.extend(masterModel, currentModel.changedAttributes);
				}
			}
		},
        /**
         * Binds a hardware model to the front-end
         *
         * @param model
         * @return {undefined}
         */
		bindModelToTransport: function(model) {
			// Listen for changes made on the hardware to update the front-end
			model.on('change', function(options) {
				self.transport.emit('receivedModelUpdate', {modelType: model.type, field: options.field, value: options.value});
			});
		},
		loadPatchFromServer: function() {
			var patchFileName = __dirname + '/currentPatch.json';

			// Read the currently stored patch file and push it to the client
			fs.readFile(patchFileName, 'utf8', function (err, data) {

				if (err) {
					console.log('Error: ' + err);
					return;
				}

				self.setMaster(JSON.parse(data));
			});

		},
		registerClient: function(socket) {
			//self.clients.push(socket);

			console.log('connect');
			for(var socketID in self.transport.sockets.connected) {
				console.log(socketID);
			}
			socket.emit('loadPatchFromServer', JSON.stringify(self.masterPatch));
			socket.on('sendModelUpdate', function(options) {
				for(var field in options.model) {
					if(self.model.outputs[field] !== undefined) {
						self.model.set(field, parseInt(options.model[field], 10));
					}
				}
			});
			// New responder. Anytime a widget changes, notify all other clients
			socket.on('client:sendModelUpdate', function(options) {
				var wid = options.wid,
				changedAttributes = options.changedAttributes;

				self.updateClients([{wid: wid, changedAttributes: changedAttributes}], this);
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
				//var patch = JSON.stringify(options.patch);
				var patch = options.patch;
				var patchFileName = __dirname + '/currentPatch.json';

				fs.writeFile(patchFileName, patch, function(err) {
					if(err) {
						console.log(err);
					}
					else {
						self.transport.emit('loadPatchFromServer', patch);
						console.log('file saved');
					}
				});
			});

		},
		updateClients: function(changes, socket) {
			this.updateMaster(changes);
			if(socket) {
				socket.broadcast.emit('server:clientModelUpdate', changes);
			}
			else {
				this.transport.emit('server:clientModelUpdate', changes);
			}
		},
		sendUpdate:function(client) {
		},
		onReceiveUpdate: function() {
		},
		addWidget: function() {
		},
		deleteWidget: function() {
		},

		broadcast: function(message, data) {
		},
	};

	return new MultiClientSync(options);
};
