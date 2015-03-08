define([
],
function(){
	var frameCount = 0,
		self;

	var TimingController = function() {
		this.frameCallbacks = [];
		this.originalCallbacks = [];
		self = this;

		window.requestAnimationFrame(this.tick);
	};

	TimingController.prototype = {
		tick: function(timeStamp) {
			var callbacks = self.frameCallbacks;

			for(var i=callbacks.length-1; i>=0; i--) {
				callbacks[i](frameCount, timeStamp);
			}

			frameCount++;

			window.requestAnimationFrame(self.tick);
		},
		registerFrameCallback: function(callback, context) {
			var indexIfExists = this.originalCallbacks.indexOf(callback);

			if(indexIfExists >= 0) {
				this.frameCallbacks[indexIfExists] = $.proxy( callback, context );
				this.originalCallbacks[indexIfExists] = callback;
			}
			else {
				this.frameCallbacks.push($.proxy( callback, context ));
				this.originalCallbacks.push(callback);
			}
		},
		removeFrameCallback: function(callback) {
			var callbackIndex = this.originalCallbacks.indexOf(callback);

			if(callbackIndex >= 0) {
				this.frameCallbacks.splice(callbackIndex, 1);
				this.originalCallbacks.splice(callbackIndex, 1);
			}
		},


	};

	return TimingController;
});
