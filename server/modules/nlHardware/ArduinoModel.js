
module.exports = function(attributes) {

	var _ = require('underscore'),
		events = require('events');

	events.EventEmitter.call(this);
	//this.prototype = events.EventEmitter.prototype;
	_.extend(this, events.EventEmitter.prototype);

	_.extend(this, {
		type: 'ArduinoUno',
		get: function(field) {
			return this.inputs[field];
		},
		set: function(field, value) {
			this.outputs[field] = value;
			this.emit('change', {field: field, value: this[field]});
			return this;
		},
		inputs: {
			A0: 0,
			A1: 0,
			A2: 0,
			A3: 0,
			A4: 0,
			A5: 0,
		},
		outputs: {
			out9: 0,
		},
	});

	_.extend(this, attributes);

	return this;
};
