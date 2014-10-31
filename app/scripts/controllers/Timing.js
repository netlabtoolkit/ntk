define([
],
function(){
	var frameCount = 0,
		self;

	var TimingController = function() {
		this.frameCallbacks = [];
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
			var indexIfExists = this.frameCallbacks.indexOf(callback);
			if(indexIfExists >= 0) {
				this.frameCallbacks[indexIfExists] = $.proxy( callback, context );
			}
			else {
				this.frameCallbacks.push($.proxy( callback, context ));
			}
		},
		removeFrameCallback: function(callback) {
			var callbackForRemoval = _.findWhere(this.frameCallbacks, function(registeredCallback) {
				return callback === registeredCallback;
			});
			this.frameCallbacks.splice(this.frameCallbacks.indexOf(callback), 1);
		},


	};

	return TimingController;
});
