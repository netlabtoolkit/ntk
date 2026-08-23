define([
	'backbone',
	'rivets',
	'views/item/WidgetMulti',
	'text!./template.js',
	'jqueryknob',
],
function(Backbone, rivets, WidgetView, Template, jqueryknob){
	'use strict';

	// Dynamic time warping distance between two numeric sequences, normalized
	// by path length so the threshold is roughly independent of template size.
	function dtwDistance(a, b) {
		var n = a.length,
			m = b.length,
			i, j;

		var dtw = [];
		for(i = 0; i <= n; i++) {
			dtw.push(new Array(m + 1).fill(Infinity));
		}
		dtw[0][0] = 0;

		for(i = 1; i <= n; i++) {
			for(j = 1; j <= m; j++) {
				var cost = Math.abs(a[i - 1] - b[j - 1]);
				dtw[i][j] = cost + Math.min(dtw[i - 1][j], dtw[i][j - 1], dtw[i - 1][j - 1]);
			}
		}

		return dtw[n][m] / (n + m);
	}

	function rangeOf(values) {
		return Math.max.apply(null, values) - Math.min.apply(null, values);
	}

	// Used both to reject a degenerate (near-flat) recorded template, and at
	// runtime to decide whether the signal is currently "moving" at all - see
	// frameTick's segment state machine.
	var MOVEMENT_RANGE = 40;
	// How many recent samples define "right now" for the moving/still check.
	var STILLNESS_WINDOW_SAMPLES = 4;
	// Safety cap so a signal that never settles doesn't capture forever.
	var MAX_SEGMENT_SAMPLES = 400;
	// Up to 4 independently-recorded gestures, each with its own output -
	// like Splitter's 4 outs, but each slot fires on a different trained
	// gesture rather than a different input range.
	var SLOT_COUNT = 4;

	return WidgetView.extend({
		typeID: 'Gesture',
		categories: ['logic'],
		className: 'gesture',
		template: _.template(Template),

		ins: [
			{title: 'in', to: 'in'},
		],
		outs: [
			{title: 'out1', from: 'out1', to: 'out1'},
			{title: 'out2', from: 'out2', to: 'out2'},
			{title: 'out3', from: 'out3', to: 'out3'},
			{title: 'out4', from: 'out4', to: 'out4'},
		],
		sources: [],

		initialize: function(options) {
			WidgetView.prototype.initialize.call(this, options);

			// Internal-only state, not saved with the patch. Indexed 0-3 for
			// slots 1-4. Must exist before the model.set(defaults) below: that
			// triggers 'change' synchronously (WidgetMulti's own initialize,
			// which just ran, already bound onModelChange), which reads these.
			this.lastSampleTime = 0;
			this.trueTimers = [undefined, undefined, undefined, undefined];
			this.falseTimers = [undefined, undefined, undefined, undefined];
			this.previousTemplates = [[], [], [], []];
			this.state = 'idle';
			this.recentSamples = [];
			this.activeSegment = [];
			this.stillSince = null;
			this.playTimer = undefined;

			var defaults = {
				title: 'Gesture',
				in: 0,
				// Lets hardware be wired up and moved around while setting up a
				// patch without producing spurious matches/output - same idea as
				// AnalogIn's active checkbox.
				active: true,
				recording: false,
				// See togglePlay - scrubs the dial through the recorded
				// template's own values (unscaled, so the original range isn't
				// distorted) and genuinely drives 'in', exercising the real
				// matcher exactly as a live gesture would.
				playing: false,
				// Which slot (1-4) Record/Stop reads and writes, and which slot's
				// live distance/recognitionLevel is shown while tuning.
				recordSlot: 1,
				statusMessage: '',
				distance: 0,
				recognitionLevel: 0,
				// Mirrors templateLength<recordSlot> - rivets bindings are static
				// keypaths, so the "more" panel can't read a dynamically-named
				// field directly; this is kept in sync whenever recordSlot
				// changes or the selected slot is recorded into.
				selectedTemplateLength: 0,
				capturing: false,
				threshold: 70,
				sampleIntervalMs: 50,
				// How long the signal must hold still (not just one sample) before
				// a gesture is considered finished. Too short and a longer gesture
				// with a brief pause/slowdown partway through gets cut off and
				// evaluated early, mid-motion.
				stillnessMs: 400,
				// Mirrors IfThen's waitTimeTrue/waitTimeFalse: how long a detected
				// match must be "pending" before the output actually switches to
				// ifMatch, and how long it then holds there before switching back.
				// Shared across slots (the timing behavior, not the template).
				waitTimeTrue: 0,
				waitTimeFalse: 1000,
				ifMatch: 1023,
				ifNoMatch: 0,
			};

			for(var i = 1; i <= SLOT_COUNT; i++) {
				// Each recorded example gesture - persisted with the patch (a
				// plain model attribute, so it round-trips through save/load like
				// any other field). Live input is captured as discrete segments
				// (movement start to movement stop, see frameTick) and each
				// completed segment is compared against every non-empty slot's
				// template via DTW exactly once; the best-scoring slot above
				// threshold fires its own output independently of the others.
				defaults['template' + i] = [];
				defaults['templateLength' + i] = 0;
				defaults['matched' + i] = false;
				defaults['ifState' + i] = 'falseOn';
				// out<i> is set below, once ifNoMatch itself is set.
			}

			this.model.set(defaults);

			for(var s = 1; s <= SLOT_COUNT; s++) {
				this.model.set('out' + s, this.model.get('ifNoMatch'));
			}

			this.localFrameTick = function() {
				this.frameTick();
			}.bind(this);

			window.app.timingController.registerFrameCallback(this.localFrameTick, this);
		},

		onRender: function() {
			// Must be registered before WidgetView.prototype.onRender below,
			// which is what actually performs rivets' bind pass over the
			// template - it resolves each rv-* attribute's binder function at
			// that point, so defining these afterward (as this used to) meant
			// they were never actually wired up: model changes updated the
			// number displays fine (plain rv-text), but rv-knob's routine was
			// never called, so externally-driven 'in' changes (e.g. playback)
			// never visually moved the dial.
			if(!app.server) {
				rivets.binders.knob = function(el, value) {
					el.value = value;
					$(el).val(parseInt(value, 10));
					$(el).trigger('change');
				};
			}
			// rv-style-* (defined in WidgetMulti.js) divides by 100 for CSS
			// properties like opacity - not what a width percentage needs.
			rivets.binders.widthpercent = function(el, value) {
				el.style.width = value + '%';
			};
			// Drives the .pending class (see styles.scss) so the blink while a
			// match is waiting on waitTimeTrue is pure CSS, no JS timer needed.
			rivets.formatters.pending = function(state) {
				return state === 'trueWaitStart';
			};

			WidgetView.prototype.onRender.call(this);

			if(!app.server) {
				// An in-widget dial to test/record with directly, without needing
				// a separate widget wired into the 'in' inlet - same setup as
				// AnalogOut/Knob's compact dial.
				this.$('.dial').knob({
					'fgColor': '#000000',
					'bgColor': '#ffffff',
					'inputColor': '#000000',
					'angleOffset': -125,
					'angleArc': 250,
					'width': 60,
					'height': 46,
					'font': "'Helvetica Neue', sans-serif",
					'displayInput': false,
					'min': 0,
					'max': 1023,
					'change': function(v) { this.model.set('in', parseInt(v, 10)); }.bind(this)
				});
			}
		},

		onRemove: function() {
			window.app.timingController.removeFrameCallback(this.localFrameTick, this);
			for(var i = 0; i < SLOT_COUNT; i++) {
				clearTimeout(this.trueTimers[i]);
				clearTimeout(this.falseTimers[i]);
			}
			clearTimeout(this.playTimer);
		},

		widgetEvents: {
			'click .recordIcon': 'toggleRecord',
			'click .playIcon': 'togglePlay',
			'change .recordSlot': 'onRecordSlotChange',
		},

		onRecordSlotChange: function() {
			var slot = parseInt(this.model.get('recordSlot'), 10);
			this.model.set('selectedTemplateLength', this.model.get('templateLength' + slot));
		},

		resetCapture: function() {
			this.state = 'idle';
			this.recentSamples = [];
			this.activeSegment = [];
			this.stillSince = null;
		},

		toggleRecord: function() {
			if(this.model.get('playing')) {
				return;
			}

			var slot = parseInt(this.model.get('recordSlot'), 10);
			var templateKey = 'template' + slot;
			var lengthKey = 'templateLength' + slot;

			if(this.model.get('recording')) {
				var template = this.model.get(templateKey);
				var range = template.length ? rangeOf(template) : 0;

				if(template.length < 3 || range < MOVEMENT_RANGE) {
					// Too little movement to be a usable template - restore
					// whatever gesture was previously trained in this slot (if
					// any) rather than leaving it empty, so a cancelled/failed
					// re-recording attempt can't destroy a working template.
					var restore = {recording: false, statusMessage: 'Too little movement - try again'};
					restore[templateKey] = this.previousTemplates[slot - 1];
					restore[lengthKey] = this.previousTemplates[slot - 1].length;
					restore.selectedTemplateLength = restore[lengthKey];
					this.model.set(restore);
				}
				else {
					this.model.set({recording: false, statusMessage: ''});
					this.resetCapture();
				}
			}
			else {
				this.previousTemplates[slot - 1] = this.model.get(templateKey);
				var reset = {recording: true, statusMessage: '', selectedTemplateLength: 0};
				reset[templateKey] = [];
				reset[lengthKey] = 0;
				this.model.set(reset);
				this.resetCapture();
			}
		},

		// Steps the dial through the selected slot's recorded values at their
		// original recording pace, unscaled, so it doesn't distort the shape
		// the way mapping onto the knob's 0-1023 range would. Genuinely drives
		// 'in' - frameTick treats it exactly like a live gesture, so this also
		// exercises the real matcher without having to physically repeat the
		// motion. toggleRecord/togglePlay keep the two modes mutually exclusive.
		togglePlay: function() {
			if(this.model.get('recording') || this.model.get('playing')) {
				return;
			}

			var slot = parseInt(this.model.get('recordSlot'), 10);
			var template = this.model.get('template' + slot);
			if(template.length === 0) {
				return;
			}

			var self = this;
			var index = 0;
			var intervalMs = parseInt(this.model.get('sampleIntervalMs'), 10);

			this.model.set('playing', true);

			var step = function() {
				if(index >= template.length) {
					self.model.set('playing', false);
					return;
				}
				self.model.set('in', template[index]);
				index++;
				self.playTimer = setTimeout(step, intervalMs);
			};

			step();
		},

		// A detected match starts the true-side transition for that slot: if
		// waitTimeTrue is 0 the output switches immediately, otherwise it only
		// switches once the match has stayed "pending" for that long (mirrors
		// IfThen's waitTimeTrue). Either way, once true, a separate timer
		// (waitTimeFalse) switches it back - the "stays active for a while"
		// behavior. Each slot's timers are independent, so one slot holding
		// its output doesn't block another slot from firing.
		startTrueTransition: function(slot) {
			var self = this;
			var waitTimeTrue = parseInt(this.model.get('waitTimeTrue'), 10);

			clearTimeout(this.trueTimers[slot - 1]);

			if(waitTimeTrue === 0) {
				this.commitMatched(slot, true);
			}
			else {
				this.model.set('ifState' + slot, 'trueWaitStart');
				this.trueTimers[slot - 1] = setTimeout(function() {
					self.commitMatched(slot, true);
				}, waitTimeTrue);
			}
		},

		commitMatched: function(slot, isMatched) {
			var self = this;
			var outKey = 'out' + slot;

			if(isMatched) {
				var trueUpdate = {};
				trueUpdate['matched' + slot] = true;
				trueUpdate['ifState' + slot] = 'trueOn';
				trueUpdate[outKey] = this.model.get('ifMatch');
				this.model.set(trueUpdate);

				clearTimeout(this.falseTimers[slot - 1]);
				var waitTimeFalse = parseInt(this.model.get('waitTimeFalse'), 10);
				this.falseTimers[slot - 1] = setTimeout(function() {
					self.commitMatched(slot, false);
				}, waitTimeFalse);
			}
			else {
				var falseUpdate = {};
				falseUpdate['matched' + slot] = false;
				falseUpdate['ifState' + slot] = 'falseOn';
				falseUpdate[outKey] = this.model.get('ifNoMatch');
				this.model.set(falseUpdate);
			}
		},

		// Evaluated exactly once per completed segment (movement start to
		// movement stop), rather than continuously against a sliding window -
		// see the class comment above the state machine in frameTick. Compares
		// against every trained slot and lets only the best-scoring match above
		// threshold fire, so one physical gesture can't trigger two outputs at
		// once even if it's ambiguously close to more than one trained slot.
		evaluateSegment: function(segment) {
			if(segment.length < 3 || rangeOf(segment) < MOVEMENT_RANGE) {
				return;
			}

			var matchThreshold = parseFloat(this.model.get('threshold'));
			var selectedSlot = parseInt(this.model.get('recordSlot'), 10);
			var bestSlot = -1;
			var bestLevel = -1;

			for(var slot = 1; slot <= SLOT_COUNT; slot++) {
				var template = this.model.get('template' + slot);
				if(template.length === 0) {
					continue;
				}

				var distance = dtwDistance(segment, template);
				// Normalized against the template's own range, not the match
				// threshold - so the percentage scale means the same thing (and
				// stays stable) regardless of where you set the threshold. 0%
				// at a full-range-of-error distance or further, 100% at zero.
				var templateScale = rangeOf(template);
				var level = Math.max(0, Math.min(100, 100 * (1 - distance / templateScale)));

				if(slot === selectedSlot) {
					this.model.set({distance: distance, recognitionLevel: level});
				}

				if(level >= matchThreshold && level > bestLevel) {
					bestLevel = level;
					bestSlot = slot;
				}
			}

			if(bestSlot !== -1) {
				this.startTrueTransition(bestSlot);
			}
		},

		// Runs at frame rate but only actually samples every sampleIntervalMs -
		// gesture input (a knob/sensor being moved by hand) doesn't need 60Hz
		// resolution. While not explicitly recording a template, this tracks
		// whether the signal is currently moving or at rest; a full movement
		// -> rest cycle is treated as one discrete gesture attempt and handed
		// to evaluateSegment exactly once, rather than continuously comparing
		// a sliding window (which let a stale/misaligned window score a
		// coincidental partial match independent of the actual gesture).
		frameTick: function() {
			var now = Date.now();

			if(now - this.lastSampleTime < this.model.get('sampleIntervalMs')) {
				return;
			}
			this.lastSampleTime = now;

			// togglePlay drives 'in' itself - deliberately NOT skipped here, so
			// played-back values are captured/matched exactly like a live
			// gesture. Lets a user verify a recorded gesture actually matches
			// without re-performing it. togglePlay/toggleRecord already keep
			// playing and recording mutually exclusive.
			var value = parseFloat(this.model.get('in'));
			if(isNaN(value)) {
				return;
			}

			if(this.model.get('recording')) {
				var slot = parseInt(this.model.get('recordSlot'), 10);
				var templateKey = 'template' + slot;
				var lengthKey = 'templateLength' + slot;
				var template = this.model.get(templateKey).slice();
				template.push(value);
				var update = {selectedTemplateLength: template.length};
				update[templateKey] = template;
				update[lengthKey] = template.length;
				this.model.set(update);
				return;
			}

			// Explicit recording still works either way (the user asked for
			// it), but skip live capture/matching entirely while inactive -
			// lets hardware be connected and moved around without producing
			// spurious matches.
			if(!this.model.get('active')) {
				return;
			}

			var anyTemplate = false;
			for(var s = 1; s <= SLOT_COUNT; s++) {
				if(this.model.get('template' + s).length > 0) {
					anyTemplate = true;
					break;
				}
			}
			if(!anyTemplate) {
				return;
			}

			this.recentSamples.push(value);
			if(this.recentSamples.length > STILLNESS_WINDOW_SAMPLES) {
				this.recentSamples.shift();
			}
			var moving = this.recentSamples.length >= 2 && rangeOf(this.recentSamples) >= MOVEMENT_RANGE;

			if(this.state === 'idle') {
				if(moving) {
					this.state = 'capturing';
					this.activeSegment = this.recentSamples.slice();
					this.stillSince = null;
					this.model.set('capturing', true);
				}
			}
			else { // 'capturing'
				this.activeSegment.push(value);

				if(moving) {
					this.stillSince = null;
				}
				else {
					if(this.stillSince === null) {
						this.stillSince = now;
					}

					if(now - this.stillSince >= parseInt(this.model.get('stillnessMs'), 10)) {
						this.evaluateSegment(this.activeSegment);
						this.resetCapture();
						this.model.set('capturing', false);
					}
				}

				if(this.state === 'capturing' && this.activeSegment.length > MAX_SEGMENT_SAMPLES) {
					this.resetCapture();
					this.model.set('capturing', false);
				}
			}
		},

	});
});
