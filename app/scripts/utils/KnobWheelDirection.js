define([
	'jquery',
	'jqueryknob',
],
function($) {
	'use strict';

	// Two problems with jquery-knob's mouse-wheel handler, shared by
	// every knob widget (2026-10-27): it turns the dial the opposite way
	// to what users expect, and it only moves the dial - it never calls
	// the 'change' hook, which is how every widget hears a new value
	// (it calls 'release' instead, which no widget sets). The library
	// lives in the gitignored bower_components, so instead of editing
	// it, wrap $.fn.knob: after a knob is built, each wheel handler it
	// bound is called with the wheel deltas negated, then 'change' gets
	// the new value. The handler only reads e.preventDefault and
	// e.originalEvent's detail/wheelDeltaX/wheelDeltaY, so a stand-in
	// event is enough.
	var WHEEL_EVENTS = ['mousewheel', 'DOMMouseScroll'];
	var originalKnob = $.fn.knob;

	function flipWheelHandlers(el, input, options) {
		var events = $._data(el, 'events');
		if(!events) { return; }

		WHEEL_EVENTS.forEach(function(type) {
			(events[type] || []).forEach(function(handlerObj) {
				if(handlerObj.ntkWheelFlipped) { return; }
				handlerObj.ntkWheelFlipped = true;

				var handler = handlerObj.handler;
				handlerObj.handler = function(e) {
					var ori = e.originalEvent || {};
					var before = $(input).val();
					var result = handler.call(this, {
						preventDefault: function() { e.preventDefault(); },
						originalEvent: {
							detail: -(ori.detail || 0),
							wheelDeltaX: -(ori.wheelDeltaX || 0),
							wheelDeltaY: -(ori.wheelDeltaY || 0),
						},
					});
					var after = $(input).val();
					if(after !== before && typeof options.change === 'function') {
						options.change(parseFloat(after));
					}
					return result;
				};
			});
		});
	}

	$.fn.knob = function(options) {
		var result = originalKnob.apply(this, arguments);
		options = options || {};

		// The knob binds its wheel handler on the input and on the
		// canvas it adds next to it.
		this.each(function() {
			var input = this;
			flipWheelHandlers(input, input, options);
			$(input).parent().find('canvas').each(function() {
				flipWheelHandlers(this, input, options);
			});
		});

		return result;
	};
});
