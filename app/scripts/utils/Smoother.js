define([
],
function () {
	'use strict';

	/**
	 * Smooths a jittery signal (AnalogIn/DigitalIn/Process/GroveIn's
	 * "smo" option) without making it sluggish.
	 *
	 * This used to be a plain moving average over the last N calls. That
	 * has two problems for a noisy sensor: the lag is the full window
	 * (the default 60 samples at 60 calls/s is a full second behind a
	 * real move), and it doesn't actually stop the readout flickering -
	 * an average sitting near a whole-number boundary still flips back
	 * and forth across it. Replaced 2026-10-05 with two stages:
	 *
	 * 1. A "One Euro" filter (Casiez, Roussel & Vogel, CHI 2012) - a
	 *    low-pass whose cutoff rises with how fast the signal is
	 *    moving. Sitting still, the cutoff is low and jitter is
	 *    averaged away; during a deliberate move the cutoff opens up
	 *    and the output follows almost immediately.
	 * 2. A catch-up term for SMALL real moves, which don't look fast
	 *    enough to open the filter by speed alone: the cutoff also
	 *    rises when the median of the last few distinct readings sits
	 *    away from the filtered value. A lone spike doesn't shift a
	 *    median; a real change of level does, within a few readings.
	 * 3. A hysteresis step on the whole-number output, so what's left
	 *    of the noise can't toggle the last digit.
	 *
	 * Tuned against the real thing, not white noise: an ESP32's analog
	 * input idles with frequent one-off spikes of up to ~16 counts
	 * (taken from a log of a board at rest), and in the browser each
	 * reading is typically held for several calls, since this runs
	 * every animation frame but the hardware reports less often. The
	 * first version (same day) measured speed against the filtered
	 * value; a held spike then read as sustained movement and blew the
	 * filter open - "even with a smooth setting of 100 I still see
	 * quite a bit of jitter". Speed is measured between consecutive
	 * raw inputs now, so a spike's rise and fall cancel.
	 *
	 * Time-based, not sample-count-based: it measures the real time
	 * between calls, so it behaves the same whether it's called 60
	 * times a second (browser) or 10 (see standalone_interpreter.py's
	 * _Smoother, which must stay a line-for-line match of the maths
	 * here).
	 *
	 * The widget's "smooth" amount (1 upward, no upper limit; default
	 * 250, picked by hand on a real ESP32 analog input) sets how hard
	 * the at-rest smoothing is: higher = steadier at rest. It has
	 * little effect on how fast a big move gets through; small moves
	 * and slow drifts take longer the higher it goes.
	 */

	// At-rest cutoff in Hz = REST_CUTOFF_SCALE / amount (250 -> 0.06Hz).
	var REST_CUTOFF_SCALE = 15;
	// How much the cutoff opens per unit/second of movement beyond
	// SPEED_FLOOR. Values are on NTK's 0-1023 scale: a quarter-range
	// move in half a second (~500 units/s) adds ~8Hz.
	var SPEED_GAIN = 0.02;
	// Apparent speed below this is treated as noise, not movement - a
	// few counts of jitter between calls already reads as tens of
	// units/second, and without a floor that alone was enough to keep
	// the filter half open at rest. The plain One Euro filter has no
	// such term; added after simulating +/-3 and +/-8 count jitter.
	var SPEED_FLOOR = 150;
	// The catch-up term: how many distinct readings the median looks
	// at, how far (in counts) it has to be from the filtered value
	// before it counts, and how many Hz each further count adds.
	var CATCHUP_READINGS = 7;
	var CATCHUP_DEADBAND = 4;
	var CATCHUP_GAIN = 0.5;
	// A reading equal to the previous one is only added to the median's
	// history this often - otherwise a value held across many calls
	// would fill it and stop it being a median of readings at all.
	var CATCHUP_REPEAT_S = 0.15;
	// Cutoff for the speed estimate itself, as in the paper.
	var SPEED_CUTOFF = 1.0;
	// A gap longer than this between calls means the history is stale
	// (widget was off, patch was paused) - start again from the input.
	var RESET_AFTER_S = 0.5;
	// The output only moves to a new whole number once the filtered
	// value is this far from the current one (0.5 would be plain
	// rounding; the extra is the hysteresis band).
	var OUTPUT_HYSTERESIS = 0.75;

	function lowPassAlpha(dt, cutoff) {
		var tau = 1 / (2 * Math.PI * cutoff);
		return 1 / (1 + tau / dt);
	}

	var Smoother = function(options) {

		this.amount = (options && options.tolerance) || 1;
		if(options && options.active) {
			this.active = options.active;
		}
		else {
			this.active = false;
		}

		this.reset();
	};

	Smoother.prototype = {
		reset: function() {
			this.lastTime = null;
			this.lastInput = 0;
			this.filtered = 0;
			this.speed = 0;
			this.output = 0;
			this.readings = [];
			this.lastReadingTime = 0;
		},
        /**
         * setBufferLength - sets the smoothing amount. (Named for the
         * moving-average buffer this class used to be; kept because
         * every widget's "smooth" field handler calls it.)
         *
         * @param size
         * @return {undefined}
         */
		setBufferLength: function(size) {
			this.amount = size;
			this.reset();
		},
		/**
		 * @param {number} input
		 * @param {number} now seconds; only passed by tests
		 * @return {number}
		 */
		smoothInput: function(input, now) {
			if(!this.active) {
				return input;
			}

			input = parseFloat(input);
			if(isNaN(input)) {
				return input;
			}
			if(typeof now !== 'number') {
				now = Date.now() / 1000;
			}

			var dt = this.lastTime === null ? null : now - this.lastTime;
			this.lastTime = now;

			if(dt === null || dt <= 0 || dt > RESET_AFTER_S) {
				this.lastInput = input;
				this.filtered = input;
				this.speed = 0;
				this.output = Math.round(input);
				this.readings = [input];
				this.lastReadingTime = now;
				return this.output;
			}

			var amount = Math.max(1, parseFloat(this.amount) || 1);
			var rawSpeed = (input - this.lastInput) / dt;
			this.lastInput = input;
			this.speed += lowPassAlpha(dt, SPEED_CUTOFF) * (rawSpeed - this.speed);

			var readings = this.readings;
			if(input !== readings[readings.length - 1] || now - this.lastReadingTime > CATCHUP_REPEAT_S) {
				readings.push(input);
				this.lastReadingTime = now;
				if(readings.length > CATCHUP_READINGS) {
					readings.shift();
				}
			}
			var sorted = readings.slice().sort(function(a, b) { return a - b; });
			var median = sorted[Math.floor(sorted.length / 2)];

			var cutoff = REST_CUTOFF_SCALE / amount +
				SPEED_GAIN * Math.max(0, Math.abs(this.speed) - SPEED_FLOOR) +
				CATCHUP_GAIN * Math.max(0, Math.abs(median - this.filtered) - CATCHUP_DEADBAND);
			this.filtered += lowPassAlpha(dt, cutoff) * (input - this.filtered);

			if(Math.abs(this.filtered - this.output) >= OUTPUT_HYSTERESIS) {
				this.output = Math.round(this.filtered);
			}

			return this.output;
		},
		/**
		 * Returns a function suitable for being part of the signal processing chain
		 *
		 * @return {function}
		 */
		getChainFunction: function() {
			// Not .bind(this) directly - the signal chain calls each
			// function with extra arguments, and the second one here
			// is reserved for a test clock.
			var self = this;
			return function(input) {
				return self.smoothInput(input);
			};
		},
		/**
		 * Toggle the active state (bypass/process)
		 *
		 * @return {Smoother} returns this Smoother
		 */
		toggleActive: function() {
			this.active = !this.active;
			this.reset();

			return this;
		},
	};

	return Smoother;
});
