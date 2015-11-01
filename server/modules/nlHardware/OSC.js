
module.exports = function(attributes) {

	var _ = require('underscore'),
		osc = require('node-osc'),
		events = require('events');
		es6 = require('es6-shim');

	var constructor = function() {
		this.OSCClient = new osc.Client('127.0.0.1', 57120);
		var OSCServer = new osc.Server(57190, '0.0.0.0');

		OSCServer.on("message", function (msg, rinfo) {
			var field = msg[0],
			value = msg[1];

			this.set(field, value);
		}.bind(this));


		this.OSCServer = OSCServer;

		return this;
	};

	// Base HardwareModel class
	var OSCHardwareModel = {
		get: function(field) {
			return this.receiving[field];
		},
		set: function(field, value) {
			if(this.sending[field] !== undefined) {
				if(parseInt(this.sending[field],10) !== parseInt(value,10)) {
					this.sending[field] = value;
					this.OSCClient.send("/"+field, value);
				}
			}
			else if(this.receiving[field] !== undefined) {
				if(parseInt(this.receiving[field], 10) !== parseInt( value, 10 )) {
					this.receiving[field] = value;
					this.emit('change', {field: field, value: this.receiving[field]});
				}
			}
			return this;
		},
		setPollSpeed: function(highLow) {
		},
	};
	_.extend(constructor.prototype, OSCHardwareModel);

	// EVENTS
	events.EventEmitter.call(constructor.prototype);
	_.extend(constructor.prototype, events.EventEmitter.prototype);

	// MODEL PROPERTIES
	_.extend(constructor.prototype, {
		type: 'OSC',
		receiving: {
			'ntkReceiveMsg': 0,
		},
		sending: {
			'ntkSendMsg': 0,
		},
	});

	_.extend(constructor.prototype, attributes);

	return new constructor();
};
