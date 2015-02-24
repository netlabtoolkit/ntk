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
				output = ((parseFloat( input, 10) - inputFloor) * scalingFactor) + outputFloor;
            
			return output;
		},
        /**
         * Inverts a signal
         *
         * @param {number} input
         * @return {number}
         */
		invert: function(input) {
			var output = parseFloat(input,10);

			if(this.model.get('invert')) {
                
				output = (output - (output * 2)) + parseInt(this.model.get('outputCeiling'),10);
			}

			return output;
		},
	};
});
