define([
],
function( Backbone ) {
	'use strict';

	var SocketAdapter = function() {
		this.bindToSocketServer();
		window.app.serverMode = true;
	};


	SocketAdapter.prototype = {
		bindToSocketServer: function() {
			var serverAddress = window.location.host,
				self = this;

			console.log("SERVER ADDRESS", serverAddress);
			var socket = this.socket = window.io.connect(serverAddress);

			this.registerInboundServerEvents(socket);
			this.registerOutboundClientEvents(socket);

		},
		registerInboundServerEvents: function registerInboundServerEvents(socket) {
			socket.on("loadPatchFromServer", function(data) {
				window.app.vent.trigger('ToolBar:loadPatch', data);
			});

			socket.on("serverActive", function(serverActive) {
				window.app.serverMode = serverActive;
				window.app.vent.trigger('serverActive', serverActive);
			});

			socket.on("connect", function() {
				self.connected = true;
				window.app.vent.trigger("socket:connected");
			});

			socket.on("error", function(err){
				console.log("ERROR: ", err);
			});

			// MODEL AND PATCH UPDATES
			
			// MODEL UPDATE
			socket.on("server:clientModelUpdate", function(data){
				window.app.vent.trigger('updateWidgetModelFromServer', data);
			});

			// MAPPING UPDATE
			socket.on('server:clientMappingUpdate', function(data) {
				window.app.vent.trigger('updateWidgetMappingFromServer', JSON.parse( data ));
			});

			// DEVICE UPDATE
			socket.on("receivedModelUpdate", function(data){
				if(window.app && window.app.vent) {
					window.app.vent.trigger("receivedDeviceModelUpdate", data);
				}
			});
			//END MODEL AND PATCH UPDATES

			socket.on("disconnect", function() {
				self.connected = false;
			});

		},
		registerOutboundClientEvents: function registerClientEvents(socket) {
			// MODEL AND PATCH UPDATES
			var deviceUpdateThrottleID = undefined;

			// MODEL
			window.app.vent.on('widgetUpdate', function(options){
				if(window.app.server || !window.app.serverMode) {
					socket.emit('client:sendModelUpdate', options);
				}
			});

			var sendQueue = [];
			// DEVICE MODEL
			window.app.vent.on('sendDeviceModelUpdate', function(options) {
				if(window.app.server || !window.app.serverMode) {

					// Queue and package multiple messages
					var field = _.keys(options.model);

					var previouslyQueued = _.findWhere(sendQueue, function(queueItem) {
						return queueItem.modelType == options.modelType && _.findWhere(queueItem.model[field] ) !== undefined;
					});

					if(previouslyQueued !== undefined) {
						sendQueue.push(options);
					}
					else {
						// Clean sendQueue of any previously defined updated for this particular field
						sendQueue = _.reject(sendQueue, function(entry) {
							return entry.model[field] !== undefined;
						});

						sendQueue.push(options);
						//previouslyQueued = options.model;
					}

					// THROTTLE THESE
					if(deviceUpdateThrottleID !== undefined) {
						clearTimeout(deviceUpdateThrottleID);
					}

					deviceUpdateThrottleID = setTimeout(function() {
						socket.emit('sendModelUpdate', options);

						deviceUpdateThrottleID = undefined;

						sendQueue.length = 0;
					}.bind(this), 10);
				}
			});



			// MAPPING
			// Takes the current mappings and pushes them ALL to the server
			window.app.vent.on('updateModelMappings', function(mappings) {
				if(window.app.server || !window.app.serverMode) {
					socket.emit('client:updateModelMappings', JSON.stringify( mappings ));
				}
			});

			// Updates the source mappings directly from the model, MERGING changes for that model only
			window.app.vent.on('Widget:updateSourceMappings', function(wid, sources) {
				if(window.app.server || !window.app.serverMode) {
					var options = {
						wid: wid,
						mappings: sources
					};

					socket.emit('client:sendSourceMappingUpdate', JSON.stringify( options ));
				}
			});



			// Options here are the wid of the model
			window.app.vent.on('addWidget', function(widgetModel) {
				if(window.app.server || !window.app.serverMode) {
					socket.emit('client:addWidget', JSON.stringify( widgetModel ));
				}
			});
			window.app.vent.on('removeWidget', function(widgetWID) {
				if(window.app.server || !window.app.serverMode) {
					socket.emit('client:removeWidget', widgetWID);
				}
			});

			// END MODEL AND PATCH UPDATES


			window.app.vent.on('clearPatch', function(patch) {
				if(window.app.server || !window.app.serverMode) {
					socket.emit('client:clearPatch', JSON.stringify( patch ));
				}
			});
			window.app.vent.on('Widget:hardwareSwitch', function(portAndMode) {
				if(window.app.server || !window.app.serverMode) {
					socket.emit('client:changeIOMode', JSON.stringify( portAndMode ));
				}
			});

			window.app.vent.on('loadPatchFileToServer', function(patch) {
				if(window.app.server || !window.app.serverMode) {
					socket.emit('loadPatchFile', {patch: JSON.stringify(patch)});
				}
			});

			window.app.vent.on('savePatchToServer', function(options) {

				var collection = options.collection,
				mappings = options.mappings;

				var saveConfig = {
					widgets: collection.toJSON(),
					mappings: mappings,
				};

				saveConfig = {patch: saveConfig};
				socket.emit('saveCurrentPatch', JSON.stringify(saveConfig));
			});

			window.app.vent.on('ToolBar:toggleServer', function(options) {
				socket.emit('client:toggleServer');
				window.app.serverMode = !window.app.serverMode;
			});
		},
	};

	return SocketAdapter;
});
