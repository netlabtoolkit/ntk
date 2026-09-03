define([], function() {
	'use strict';

	/**
	 * Shared by PoseTrack and Gesture (both 4-slot, trainable, threshold-
	 * based matcher widgets) for their outlet slot indicator dots - lifted
	 * out once Gesture needed the exact same red -> yellow -> green
	 * confidence mapping PoseTrack already had, rather than keeping two
	 * copies of identical color math in sync by hand.
	 */

	// Color stops for matchLevelToColor()'s red -> yellow -> green -> deep
	// green sweep - the familiar traffic-light convention, with a 4th stop
	// so matches ABOVE threshold keep differentiating instead of clamping
	// to one flat color. Colors match ones already used elsewhere in the
	// app's own UI (#e53935 for GroveSensor's error dot, #fbc02d-ish amber
	// tones, #4caf50 for "matched", #2e7d32 - PoseTrack's/Gesture's own
	// .currentMatch text color - for "matched, and strongly so").
	var DOT_COLOR_LOW = {r: 229, g: 57, b: 53};    // red, weak/no match
	var DOT_COLOR_MID = {r: 251, g: 192, b: 45};   // yellow, halfway to threshold
	var DOT_COLOR_HIGH = {r: 76, g: 175, b: 80};   // green, right at threshold
	var DOT_COLOR_MAX = {r: 46, g: 125, b: 50};    // deep green, a perfect (100) match

	function lerpChannel(a, b, t) {
		return Math.round(a + (b - a) * t);
	}

	/**
	 * matchLevelToColor - maps a match level to a red -> yellow -> green ->
	 * deep green color (traffic-light convention, extended) for an
	 * outlet's slot dot, so it reads as a continuous live "how close is
	 * this slot to matching" meter, not just a flat on/off once officially
	 * matched. Scaled relative to the configured threshold for the lower
	 * two-thirds of the scale: no match at all (level 0) is red, halfway
	 * to threshold is yellow, reaching the threshold itself (a real match)
	 * is green. Levels CONTINUING past threshold keep differentiating too
	 * (green -> deep green, all the way to a perfect level of 100) rather
	 * than clamping to one flat color at the threshold - added after live
	 * testing showed two matches at very different levels (e.g. 86% and
	 * 100%) landing as visually identical solid green, since both were
	 * simply "at or above threshold" under the original two-segment
	 * design. A slot with no examples recorded never reaches this function
	 * at all (see evaluateFrame/evaluateSegment) - it stays flat grey.
	 *
	 * @param {number} level 0-100 raw match level
	 * @param {number} threshold 0-100 configured match threshold
	 * @return {string} CSS color, e.g. "rgb(140,165,60)"
	 */
	function matchLevelToColor(level, threshold) {
		var clampedLevel = Math.max(0, Math.min(100, level));
		// Room reserved above the threshold for the green -> deep green
		// segment - a threshold of 100 would leave no such room, so it's
		// capped at 99 here purely for this color math (doesn't touch the
		// real configured threshold used for actual matching decisions).
		var clampedThreshold = Math.max(1, Math.min(99, threshold));
		var midPoint = clampedThreshold / 2;

		var from, to, localT;
		if(clampedLevel <= midPoint) {
			from = DOT_COLOR_LOW;
			to = DOT_COLOR_MID;
			localT = clampedLevel / midPoint;
		}
		else if(clampedLevel <= clampedThreshold) {
			from = DOT_COLOR_MID;
			to = DOT_COLOR_HIGH;
			localT = (clampedLevel - midPoint) / (clampedThreshold - midPoint);
		}
		else {
			from = DOT_COLOR_HIGH;
			to = DOT_COLOR_MAX;
			localT = (clampedLevel - clampedThreshold) / (100 - clampedThreshold);
		}

		return 'rgb(' + lerpChannel(from.r, to.r, localT) + ',' +
			lerpChannel(from.g, to.g, localT) + ',' +
			lerpChannel(from.b, to.b, localT) + ')';
	}

	return {
		matchLevelToColor: matchLevelToColor,
	};
});
