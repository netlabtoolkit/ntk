define([
],
function( Backbone ) {
	'use strict';

	var HubAdapter = function() {
		this.bindToSocketServer();
	};


	HubAdapter.prototype = {
		bindToSocketServer: function() {
			var serverAddress = window.location.hostname,
                serverPort = 51001,
				self = this;

			//var socket = this.socket = window.io.connect(serverAddress);
            var socket = new WebSocket("ws://" + serverAddress + ":" + serverPort);

			socket.onopen = function(event) {
				socket.send('/service/arduino/reader-writer/connect /dev/cu.usb*');
				window.app.vent.trigger("socket:connected");
			}

			socket.onmessage = function(event) {
				console.log('received', event.data);
				if(event.data.match(/OK/)) {
					console.log('CONNECTED');
				}
			}
			socket.onclose = function(event) {
			}

			//socket.on("connect", function() {
				//self.connected = true;
				//window.app.vent.trigger("socket:connected");
			//});

			//socket.on("receivedModelUpdate", function(data){
				//if(window.app && window.app.vent) {
					//window.app.vent.trigger("receivedModelUpdate", data);
				//}
			//});

			//socket.on("disconnect", function() {
				//self.connected = false;
			//});

			//socket.on("error", function(err){
				//console.log("ERROR: ", err);
			//});

			window.app.vent.on('sendModelUpdate', function(options) {
				console.log('emitting', options);
				//socket.emit('sendModelUpdate', options);
				///service/arduino/reader-writer/poll /{/dev/cu.usbserial-A600aiy8}/analogin/0 0 24
			});
		},
	};

	return HubAdapter;
});
