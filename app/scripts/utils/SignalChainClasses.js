define([],
function () {
	// Signal chain classes
	return {
        /**
         * Smooth a signal
         *
         * @param {number} input
         * @return {number}
         */
		getSmoother: function(options) {

			var numOfHistoryItems = 1;
			if(options && options.tolerance) {
				numOfHistoryItems = options.tolerance;
			}

			var SmootherInstance = function() {
				this.values = [];
			};

			SmootherInstance.prototype = {
				pushToStack: function(input) {
					var values = this.values;
					if(values.length === 0) {

						// if we don't have values to work with, fill up the array with this value
						for(var i=numOfHistoryItems-1; i>=0; i--) {
							values[i] = input;
						}
					}
					else {
						// pop from top of stack
						this.values.shift();
						// push new value to the end
						this.values.push(input);
					}
				},
				getAveragedValues: function() {
					var sumOfElements = this.values.reduce(function(previous, current) {
						return previous + current;
					});

					return (sumOfElements / this.values.length);
				},
				smoothInput: function(input) {
					this.pushToStack(input);
					var smoothedOutput = parseInt(this.getAveragedValues(), 10);

					return smoothedOutput;
				},
			};

			var smoother = new SmootherInstance();
			return $.proxy(smoother.smoothInput, smoother);
		},
	};
});
