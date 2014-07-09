define([],
function () {
	// Static signal chain functions
	return {
        /**
         * scales a signal
         *
         * @param {number} input
         * @return {number}
         */
		scale: function(input) {
			var output,
			inputCeiling = parseInt(this.model.get('inputCeiling'),10),
			outputCeiling = parseInt(this.model.get('outputCeiling'),10),
			inputFloor = parseInt(this.model.get('inputFloor'),10),
			outputFloor = parseInt(this.model.get('outputFloor'),10);

			// process data here
			var inputRange = inputCeiling - inputFloor,
				outputRange = outputCeiling - outputFloor;

			var scalingFactor = outputRange / inputRange;
				output = ((parseInt( input, 10) - inputFloor) * scalingFactor) + outputFloor;

			return output;
		},
        /**
         * inverts a signal
         *
         * @param {number} input
         * @return {number}
         */
		invert: function(input) {
			var output = parseInt(input,10);

			window.XX = this.model;
			if(this.model.get('invert')) {
				output = (output - (output * 2)) + parseInt(this.model.get('outputCeiling'),10);
			}

			return output;
		},
	};
});
