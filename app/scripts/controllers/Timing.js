define([
],
function(){
	var frameCount = 0;

	var TimingController = function() {
		this.frameCallbacks = [];
		this.frameContexts = [];
		this.originalCallbacks = [];

		window.requestAnimationFrame(this.tick.bind(this));
	};

	TimingController.prototype = {
		tick: function(timeStamp) {
			var callbacks = this.frameCallbacks;

			for(var i=callbacks.length-1; i>=0; i--) {
				callbacks[i].call(this.frameContexts[i], frameCount, timeStamp);
			}

			frameCount++;

			window.requestAnimationFrame( this.tick.bind(this) );
		},
		/**
		 * Register a callback that will be called on each frame
		 *
		 * @param {function} callback
		 * @param {object} context
		 */
		registerFrameCallback: function(callback, context) {
			var indexIfExists = this.originalCallbacks.indexOf(callback);

			if(indexIfExists >= 0) {
				this.frameCallbacks[indexIfExists] = callback;
				this.frameContexts[indexIfExists] = context;
				this.originalCallbacks[indexIfExists] = callback;
			}
			else {
				this.frameCallbacks.push(callback);
				this.frameContexts.push(context);
				this.originalCallbacks.push(callback);
			}

		},
		removeFrameCallback: function(callback, context) {
			var callbackIndex = this.originalCallbacks.indexOf(callback);

			if(callbackIndex >= 0) {
				this.frameCallbacks.splice(callbackIndex, 1);
				this.originalCallbacks.splice(callbackIndex, 1);
				this.frameContexts.splice(callbackIndex, 1);
			}

		},


	};

	return TimingController;
});
