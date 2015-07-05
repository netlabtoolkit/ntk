define([
],
function() {
    'use strict';

    /**
	  * Generic utilities
     *
     * @return {object}
     */
	return {
		/**
		 * Call a function asynchronously
		 *
		 * @param {function} func the function to call
		 * @param {this} context the context to call the function in
		 * @param {array} parameters arguments that should be passed to the function
		 * @return {undefined}
		 */
		async: function async(func, context, parameters) {
			window.setTimeout(function async() {
				func.apply(context, parameters);
			}, 1);
		},
	};

});
