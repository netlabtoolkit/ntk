module.exports = function(options) {

	var fs = require('fs'),
		self;

	console.log('required');
	var MultiClientSync = function(options) {
		options.transport ? this.transport = options.transport : undefined;
		options.model ? this.model = options.model : undefined;
		this.masterPatch = [];

		this.transport.on('connection', this.registerClient);
		self = this;
	};

	MultiClientSync.prototype = {
		clients: [],
		setMaster: function(patch) {
			this.masterPatch = patch;
			this.broadcast('loadPatchFromServer', patch);
		},
		registerClient: function(socket) {
			var patchFileName = 'modules/nlHardware/currentPatch.json',
				model = self.model;

			// Read the currently stored patch file and push it to the client
			fs.readFile(patchFileName, 'utf8', function (err, data) {
				socket.on('saveCurrentPatch', function(options) {
					var patch = options.patch;

					fs.writeFile(patchFileName, patch, function(err) {
						if(err) {
							console.log(err);
						}
						else {
							socket.emit('loadPatchFromServer', patch);
							console.log('file saved');
						}
					});
				});

				if (err) {
					console.log('Error: ' + err);
					return;
				}

				var currentPatch = JSON.parse(data);

				socket.emit('loadPatchFromServer', JSON.stringify(currentPatch));
				socket.on('sendModelUpdate', function(options) {
					for(var field in options.model) {
						if(model.outputs[field] !== undefined) {
							model.set(field, parseInt(options.model[field], 10));
						}
					}
				});
				// New responder. Anytime a widget changes, notify all other clients
				socket.on('sendModelUpdate', function(options) {
					var wid = options.wid,
						changedAttributes = options.changedAttributes;

					self.updateClients([{wid: wid, changedAttributes: changedAttributes}], this);
				});


			});


		},
		updateClients: function(changes, socket) {
			if(socket) {
				socket.broadcast.emit('clientModelUpdate');
			}
			else {
				this.transport.emit('clientModelUpdate');
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
