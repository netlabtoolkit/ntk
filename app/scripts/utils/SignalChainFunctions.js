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
		/**
		 * Applies a single arithmetic operation (+, -, *, /) with a fixed
		 * operand to a signal. Requires model.mathOperator/mathOperand.
		 * mathOperator: 'none' (or any other unrecognized value) passes
		 * the input through unchanged. Division by zero also returns the
		 * input unchanged rather than NaN/Infinity.
		 *
		 * @param {number} input
		 * @return {number}
		 */
		math: function(input, model) {
			var output = parseFloat(input, 10);
			var operand = parseFloat(model.mathOperand, 10);

			switch(model.mathOperator) {
				case '+':
					return output + operand;
				case '-':
					return output - operand;
				case '*':
					return output * operand;
				case '/':
					return operand === 0 ? output : output / operand;
				case 'none':
				default:
					return output;
			}
		},
		/**
		 * Rounds a signal to a whole number when the widget is in int mode
		 * Requires model.valueType to be present on the Widget's model
		 *
		 * @param {number} input
		 * @return {number}
		 */
		roundToInt: function(input, model) {
			if(model.valueType === 'int') {
				return Math.round(parseFloat(input, 10));
			}

			return input;
		},
	};
});
