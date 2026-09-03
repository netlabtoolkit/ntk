define([],
function () {
	// Static signal chain functions
	return {
		/**
		 * Scales a signal
		 * Requires that the configuration options are present on the Widget's model
		 *
		 * A plain linear transform - an input outside [inputFloor,
		 * inputCeiling] extrapolates straight through to an output outside
		 * [outputFloor, outputCeiling] by default (matches the common
		 * "map"-style convention, e.g. Arduino's own map()), which several
		 * widgets (Process, OSCIn, CloudIn) may already rely on for
		 * deliberate signal gain/extrapolation on values they don't fully
		 * control the range of. Pass clampOutput=true to instead pin the
		 * result to the output range - added for GroveSensor, where a raw
		 * hardware sensor reading landing outside its expected range (e.g.
		 * a ToF sensor's "no target" sentinel, or an accelerometer spike)
		 * is a hazard, not a technique - see GroveSensor.js's call site.
		 * Every other caller invokes this with just (input, model) via
		 * WidgetMulti's generic signalChainFunctions loop, so clampOutput
		 * is always undefined/false for them - no behavior change.
		 *
		 * @param {number} input
		 * @param {object} model
		 * @param {boolean} [clampOutput] pin the result to [outputFloor, outputCeiling]
		 * @return {number}
		 */
		scale: function(input, model, clampOutput) {
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

			if(clampOutput) {
				// min/max rather than assuming outputFloor < outputCeiling -
				// a widget could configure an inverted output range (floor
				// above ceiling) to flip a signal via the range fields alone.
				var lowerBound = Math.min(outputFloor, outputCeiling),
					upperBound = Math.max(outputFloor, outputCeiling);
				output = Math.min(upperBound, Math.max(lowerBound, output));
			}

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
