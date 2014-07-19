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

			var socket = this.socket = window.io.connect(serverAddress);

			socket.on("connect", function() {
				self.connected = true;
				window.app.vent.trigger("socket:connected");
			});

			socket.on("receivedModelUpdate", function(data){
				if(window.app && window.app.vent) {
					window.app.vent.trigger("receivedModelUpdate", data);
				}
			});

			socket.on("disconnect", function() {
				self.connected = false;
			});

			socket.on("error", function(err){
				console.log("ERROR: ", err);
			});

			window.app.vent.on('sendModelUpdate', function(options) {
				socket.emit('sendModelUpdate', options);
			});
		},
	};

	return SocketAdapter;
});
