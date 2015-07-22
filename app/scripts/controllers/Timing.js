define([
],
function(){
	var frameCount = 0;

	var TimingController = function() {
		this.frameCallbacks = [];
		this.originalCallbacks = [];

		window.requestAnimationFrame(this.tick.bind(this));
	};

	TimingController.prototype = {
		tick: function(timeStamp) {
			var callbacks = this.frameCallbacks;

			for(var i=callbacks.length-1; i>=0; i--) {
				callbacks[i](frameCount, timeStamp);
			}

			frameCount++;

			window.requestAnimationFrame( this.tick.bind(this) );
		},
		registerFrameCallback: function(callback, context) {
			var boundCallback = callback.bind(context);
			var indexIfExists = this.originalCallbacks.indexOf(boundCallback);

			if(indexIfExists >= 0) {
				this.frameCallbacks[indexIfExists] = boundCallback;
				this.originalCallbacks[indexIfExists] = boundCallback;
			}
			else {
				this.frameCallbacks.push(boundCallback);
				this.originalCallbacks.push(boundCallback);
			}
		},
		removeFrameCallback: function(callback) {
			var boundCallback = callback.bind(context);
			var callbackIndex = this.originalCallbacks.indexOf(boundCallback);

			if(callbackIndex >= 0) {
				this.frameCallbacks.splice(callbackIndex, 1);
				this.originalCallbacks.splice(callbackIndex, 1);
			}
		},


	};

	return TimingController;
});
