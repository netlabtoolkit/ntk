define([],
function () {
	// Static signal chain functions
	return {
		/**
		 * Scales a signal
		 * Requires that the configuration options are present on the Widget's model
		 *
		 * @param {number} input
		 * @return {number}
		 */
		scale: function(input, model) {
			var output,
				inputCeiling = parseInt(model.inputCeiling, 10),
				outputCeiling = parseInt(model.outputCeiling, 10),
				inputFloor = parseInt(model.inputFloor, 10),
				outputFloor = parseInt(model.outputFloor, 10);

			// process data here
			var inputRange = inputCeiling - inputFloor,
				outputRange = outputCeiling - outputFloor;

			var scalingFactor = outputRange / inputRange;

			output = ((parseFloat( input, 10) - inputFloor) * scalingFactor) + outputFloor;

			return output;
		},
		/**
		 * Inverts a signal
		 *
		 * @param {number} input
		 * @return {number}
		 */
		invert: function(input, model) {
			var output = parseFloat(input, 10);

			if(model.invert) {

				output = (output - (output * 2)) + parseInt(model.outputCeiling, 10);
			}

			return output;
		},
	};
});
