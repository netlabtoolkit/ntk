module.exports = function() {
	var QueueHandler = function(cb) {
		this.sendCallback = cb;
	};

	_.extend(QueueHandler.prototype, {
		interval: 10,
		queue: [],
		lastTimeoutID: undefined,
		addToQueue: function(fieldValue) {
			if(this.queue.length == 0) {
				// then add to the queue and schedule
				this.queue.push(fieldValue);

				this.next();
			}
			else {
				// Same field AND same device. Matching on the field name
				// alone meant two boards each driving a pin with the same
				// name (D7 on both) shared one slot: whichever queued
				// last replaced the other's write, which was then never
				// sent. `model` is the target device where the caller
				// queues per device (nlMultiClientSync.js); callers that
				// don't set it (OSC.js) compare undefined to undefined,
				// i.e. unchanged.
				var lastFieldValue = _.find(this.queue, function(queued) {
					return queued.field === fieldValue.field && queued.model === fieldValue.model;
				});

				// If we find a previous version of this field already, replace it. Otherwise add it.
				if(lastFieldValue !== undefined) {
					// replace what was there with the latest value
					//this.queue[this.queue.indexOf(lastFieldValue)] = {field: field, value: value};
					this.queue[this.queue.indexOf(lastFieldValue)] = fieldValue;
				}
				else {
					this.queue.push(fieldValue);
				}
			}
		},
		next: function() {
			if(this.queue.length > 0) {

				setTimeout(function() {
					this.sendCallback(this.queue);

					this.queue.length = 0;
				}.bind(this), this.interval);

			}
		},
		sendCallback: function() {},
	});

	return {
		QueueHandler: QueueHandler,
	};
};
