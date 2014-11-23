module.exports = function(options) {

	var MultiClientSync = function() {
		this.masterPatch = [];
	};

	MultiClientSync.prototype = {
		clients: [],
		updateClients: function() {
		},
		sendUpdate:function(client) {
		},
		onReceiveUpdate: function() {
		},
		addWidget: function() {
		},
		deleteWidget: function() {
		},
	};

	return new MultiClientSync();
};
