define([
],
function () {
	'use strict';

	/**
	 * Smooth a signal
	 *
	 * @param {number} input
	 * @return {number}
	 */
	var Smoother = function(options) {

		this.numOfHistoryItems = (options && options.tolerance) || 1;
		if(options && options.active) {
			this.active = options.active;
		}
		else {
			this.active = false;
		}

		this.values = [];
	};

	Smoother.prototype = {
        /**
         * setBufferLength
         *
         * @param size
         * @return {undefined}
         */
		setBufferLength: function(size) {
			this.numOfHistoryItems = size;

			// Reinitialize the buffer
			var values = this.values;
			values.length = 0;
			for(var i=this.numOfHistoryItems-1; i>=0; i--) {
				values[i] = 0;
			}
		},
		/**
		 * Push a value to a stack used to average values
		 *
		 * @param {number} input
		 * @return {void}
		 */
		pushToStack: function(input) {
			var values = this.values;
			if(values.length === 0) {

				// if we don't have values to work with, fill up the array with this value
				for(var i=this.numOfHistoryItems-1; i>=0; i--) {
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
		/**
		 * Averages all values pushed onto the stack
		 *
		 * @return
		 */
		getAveragedValues: function() {
			var sumOfElements = this.values.reduce(function(previous, current) {
				return previous + current;
			});

			return (sumOfElements / this.values.length);
		},
		smoothInput: function(input) {
			if(this.active) {
				this.pushToStack(input);
				var smoothedOutput = parseInt(this.getAveragedValues(), 10);

				return smoothedOutput;
			}
			else {
				return input;
			}
		},
		/**
		 * Returns a function suitable for being part of the signal processing chain
		 *
		 * @return {function}
		 */
		getChainFunction: function() {
			return this.smoothInput.bind(this);
		},
		/**
		 * Toggle the active state (bypass/process)
		 *
		 * @return {Smoother} returns this Smoother
		 */
		toggleActive: function() {
			this.active = !this.active;

			return this;
		},
	};

	return Smoother;
});
