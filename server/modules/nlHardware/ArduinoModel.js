
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
			if(this.outputs[field] !== undefined) {
				if(parseInt(this.outputs[field],10) !== parseInt(value,10)) {
					this.outputs[field] = value;
					this.emit('change', {field: field, value: this.outputs[field]});
				}
			}
			else if(this.inputs[field] != undefined) {
				if(parseInt(this.inputs[field], 10) !== parseInt( value, 10 )) {
					this.inputs[field] = value;
					this.emit('change', {field: field, value: this.inputs[field]});
				}
			}
			return this;
		},
		inputs: {
			A0: 0,
			A1: 0,
			A2: 0,
		},
		outputs: {
			D3: 0,
            D5: 0,
            D6: 0,
            D9: 0,
            D10: 0,
            D11: 0,
		},
	});

	_.extend(this, attributes);

	return this;
};
