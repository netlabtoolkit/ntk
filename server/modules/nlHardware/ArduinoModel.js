
module.exports = function(attributes) {

	var _ = require('underscore'),
		events = require('events');

        events.EventEmitter.call(this);
        this.prototype = events.EventEmitter.prototype;

		_.extend(this, {
			get: function(field) {
				return this[field];
			},
			set: function(field, value) {
				this[field] = value;
				this.emit('change', {field: field, value: this[field]});
				return ;
			},
			A0: 0,
			A1: 0,
			A2: 0,
			A3: 0,
			A4: 0,
			A5: 0,
			out9: 0,
		});

		_.extend(this, attributes);


    return this;
};
