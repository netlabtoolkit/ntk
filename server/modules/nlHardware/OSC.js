
module.exports = function(attributes) {

	var _ = require('underscore'),
		osc = require('node-osc'),
		events = require('events');
		es6 = require('es6-shim');

	events.EventEmitter.call(this);
	_.extend(this, events.EventEmitter.prototype);

	// Base HardwareModel class
	var OSCHardwareModel = {
		init: function() {
			this.OSCClient = new osc.Client('127.0.0.1', 57120);
			var OSCServer = new osc.Server(57120, '0.0.0.0'),
				self = this;

			OSCServer.on("message", function (msg, rinfo) {
				var field = msg[0],
					value = msg[1];

				console.log('message!', msg, self.receiving, self.receiving[field]);

				self.set(field, value);
			});


			this.OSCServer = OSCServer;

			return this;
		},
		get: function(field) {
			return this.receiving[field];
		},
		set: function(field, value) {
			if(this.sending[field] !== undefined) {
				if(parseInt(this.sending[field],10) !== parseInt(value,10)) {
					this.sending[field] = value;
					OSCClient.send(field, value);
				}
			}
			else if(this.receiving[field] !== undefined) {
				console.log('received', field, value, parseInt(this.receiving[field], 10), parseInt( value, 10) );
				if(parseInt(this.receiving[field], 10) !== parseInt( value, 10 )) {
					this.receiving[field] = value;
					this.emit('change', {field: field, value: this.receiving[field]});
				}
			}
			return this;
		},
	};
	_.extend(this, OSCHardwareModel);


	_.extend(this, {
		type: 'OSC',
		receiving: {
			'ntkReceiveMsg': 0,
		},
		sending: {
			'ntkSendMsg': 0,
		},
	});

	_.extend(this, attributes);

	return this;
};
