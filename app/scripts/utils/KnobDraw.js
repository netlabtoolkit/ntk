define([
	'jquery',
	'jqueryknob',
	'utils/KnobWheelDirection',
],
function($) {
	'use strict';

	// Two stray lines on every jquery-knob dial (2026-11-12): a faint
	// seam across the white ring at the upper right, and a hairline at
	// the dial's start (lower left) when the value is at its minimum.
	//
	// - The library draws the ring backwards (anticlockwise) from its
	//   end angle, which with NTK's -125/250 arc is past 2*PI; Chromium
	//   leaves a seam where that path crosses the 0 angle. Drawn
	//   clockwise from start to end, there's no seam.
	// - The value arc is drawn even at the minimum, as a sliver
	//   0.00001 rad long - which still paints a black hairline.
	//
	// The library lives in the gitignored bower_components, so instead
	// of editing it, every knob gets this as its draw hook (unless a
	// widget passes its own): it draws the dial the same way, minus the
	// two lines, and returns false so the library's own draw is
	// skipped. Same approach as KnobWheelDirection.js.

	function cleanDraw() {
		var c = this.g, a = this.arc(this.cv), r = 1;
		var shows = function(arc, cursor) { return cursor || Math.abs(arc.e - arc.s) > 0.0001; };

		c.lineWidth = this.lineWidth;
		c.lineCap = this.lineCap;

		if(this.o.bgColor !== 'none') {
			c.beginPath();
			c.strokeStyle = this.o.bgColor;
			c.arc(this.xy, this.xy, this.radius, this.startAngle, this.endAngle, false);
			c.stroke();
		}

		if(this.o.displayPrevious) {
			var pa = this.arc(this.v);
			if(shows(pa, this.o.cursor)) {
				c.beginPath();
				c.strokeStyle = this.pColor;
				c.arc(this.xy, this.xy, this.radius, pa.s, pa.e, pa.d);
				c.stroke();
			}
			r = this.cv == this.v;
		}

		if(shows(a, this.o.cursor)) {
			c.beginPath();
			c.strokeStyle = r ? this.o.fgColor : this.fgColor;
			c.arc(this.xy, this.xy, this.radius, a.s, a.e, a.d);
			c.stroke();
		}
		return false;
	}

	var knob = $.fn.knob;
	$.fn.knob = function(options) {
		if(options && typeof options === 'object' && !options.draw) {
			options = $.extend({}, options, {draw: cleanDraw});
		}
		return knob.call(this, options);
	};
	$.fn.dial = $.fn.knob;

	return cleanDraw;
});
