define([
],
function( Backbone ) {
	'use strict';

	var SocketAdapter = function() {
		this.bindToSocketServer();
	};


	SocketAdapter.prototype = {
		bindToSocketServer: function() {
			var serverAddress = window.location.host,
				self = this;

				console.log("SERVER ADDRESS", serverAddress);
			var socket = this.socket = window.io.connect(serverAddress);

			socket.on("loadPatchFromServer", function(data) {
				window.app.vent.trigger('ToolBar:loadPatch', data);
			});

			socket.on("connect", function() {
				self.connected = true;
				window.app.vent.trigger("socket:connected");
			});


			socket.on("server:clientModelUpdate", function(data){
				window.app.vent.trigger('updateWidgetModelFromServer', data);
			});

			socket.on('server:clientMappingUpdate', function(data) {
				window.app.vent.trigger('updateWidgetMappingFromServer', JSON.parse( data ));
			});

			socket.on("receivedModelUpdate", function(data){
				if(window.app && window.app.vent) {
					window.app.vent.trigger("receivedDeviceModelUpdate", data);
				}
			});

			socket.on("disconnect", function() {
				self.connected = false;
			});

			socket.on("error", function(err){
				console.log("ERROR: ", err);
			});

			//if(window.app.server) {
				//window.app.vent.on('sendModelUpdate', function(options) {
					//socket.emit('sendModelUpdate', options);
				//});


				//window.app.vent.on('widgetUpdate', function(options){
					//socket.emit('client:sendModelUpdate', options);
				//});
			//}
			//else {
				window.app.vent.on('sendModelUpdate', function(options) {
					socket.emit('sendModelUpdate', options);
				});
				window.app.vent.on('widgetUpdate', function(options){
					socket.emit('client:sendModelUpdate', options);
				});
				window.app.vent.on('addWidget', function(options) {
					socket.emit('client:addWidget', JSON.stringify( options ));
				});
				window.app.vent.on('removeWidget', function(options) {
					socket.emit('client:removeWidget', options);
				});
				window.app.vent.on('updateModelMappings', function(mappings) {
					socket.emit('client:updateModelMappings', JSON.stringify( mappings ));
				});

				window.app.vent.on('clearPatch', function(patch) {
					socket.emit('client:clearPatch', JSON.stringify( patch ));
				});
				window.app.vent.on('Widget:hardwareSwitch', function(portAndMode) {
					socket.emit('client:changeIOMode', JSON.stringify( portAndMode ));
				});

				window.app.vent.on('Widget:updateSourceMappings', function(wid, sources) {
					var options = {
						wid: wid,
						mappings: sources
					};

					socket.emit('client:sendSourceMappingUpdate', JSON.stringify( options ));
				});

				window.app.vent.on('loadPatchFileToServer', function(patch) {
					socket.emit('loadPatchFile', {patch: JSON.stringify(patch)});
				});
			//}

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
		},
	};

	return SocketAdapter;
});
