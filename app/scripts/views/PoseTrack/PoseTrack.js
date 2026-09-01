define([
	'backbone',
	'rivets',
	'views/item/WidgetMulti',
	'text!./template.js',
	'./trackModeCatalog',
],
function(Backbone, rivets, WidgetView, Template, trackModeCatalog){
	'use strict';

	// Up to 4 independently-trained poses, each with its own output -
	// same shape as Gesture's SLOT_COUNT.
	var SLOT_COUNT = 4;
	// A "record" click captures a burst of frames over this window
	// (Teachable Machine-style "hold the pose while it samples") rather
	// than Gesture's manual start/stop toggle - there's no motion to
	// bound the recording length by, so a fixed duration stands in for
	// that. Can still be stopped early by clicking again.
	var RECORD_BURST_MS = 2000;
	// Fewer valid frames than this during a recording burst means the
	// pose was barely ever actually detected (e.g. hand out of frame
	// most of the time) - reject the same way Gesture rejects a
	// too-flat template, rather than training on too little data.
	var MIN_EXAMPLES_PER_RECORDING = 5;
	// Throttles detectForVideo() calls inside the shared per-frame tick,
	// matching FaceTrack's/Gesture's ~20fps convention.
	var DETECT_INTERVAL_MS = 50;
	// 1-NN match distance -> 0-100% level conversion. Feature vectors
	// are normalized (translated to a reference landmark, scaled by a
	// reference distance - see trackModeCatalog.js), so two genuinely
	// different poses' distance apart tends to fall in a fairly
	// consistent range regardless of hand/body mode - this is a
	// starting estimate for what counts as "0% match", not an
	// empirically-tuned constant. Needs live-camera calibration; adjust
	// here if real matches consistently read too high/low.
	var MATCH_DISTANCE_SCALE = 1.5;

	// Bundled locally (fetched by buildScripts/fetchMediaPipeAssets.sh into
	// server/assets/mediapipe/, served at /assets - see
	// server/modules/nlWebServer/routes.js) - never loaded from Google's CDN,
	// this app needs to work offline. Same shared Tasks-Vision WASM runtime
	// FaceTrack.js uses - only the .task model path differs, and that comes
	// from trackModeCatalog.js per the selected mode.
	//
	// Root-relative (leading '/'), not a RequireJS-style bare path: dynamic
	// import() is a browser-native ES module loader, completely separate
	// from RequireJS's baseUrl/paths resolution - a specifier that doesn't
	// start with '/', './', '../', or a full URL is a "bare specifier",
	// which only resolves via an import map (this app doesn't define one),
	// so it fails with "Failed to resolve module specifier".
	var VISION_BUNDLE_PATH = '/assets/mediapipe/vision_bundle.mjs';
	var WASM_BASE_PATH = '/assets/mediapipe/wasm';

	/**
	 * averagePoint - the midpoint of one or more landmarks (e.g. the two
	 * shoulder landmarks for body mode's origin). A single-index array
	 * just returns that one landmark unchanged.
	 *
	 * @param {Array} landmarks MediaPipe's raw landmark array ({x,y,z} each)
	 * @param {Array} indices landmark indices to average together
	 * @return {object} {x, y}
	 */
	function averagePoint(landmarks, indices) {
		var sumX = 0, sumY = 0;
		for(var i = 0; i < indices.length; i++) {
			sumX += landmarks[indices[i]].x;
			sumY += landmarks[indices[i]].y;
		}
		return {x: sumX / indices.length, y: sumY / indices.length};
	}

	function distance2D(a, b) {
		var dx = a.x - b.x, dy = a.y - b.y;
		return Math.sqrt(dx * dx + dy * dy);
	}

	function euclideanDistance(a, b) {
		var sum = 0;
		for(var i = 0; i < a.length; i++) {
			var diff = a[i] - b[i];
			sum += diff * diff;
		}
		return Math.sqrt(sum);
	}

	// Color stops for matchLevelToColor()'s blue -> yellow -> green sweep.
	// Yellow/green picked to match colors already used elsewhere in this
	// widget's own UI (#fbc02d-ish amber tones, #4caf50 for "matched").
	var DOT_COLOR_LOW = {r: 30, g: 136, b: 229};   // blue, weak/no match
	var DOT_COLOR_MID = {r: 251, g: 192, b: 45};   // yellow, right at threshold
	var DOT_COLOR_HIGH = {r: 76, g: 175, b: 80};   // green, perfect match

	function lerpChannel(a, b, t) {
		return Math.round(a + (b - a) * t);
	}

	/**
	 * matchLevelToColor - maps a match level to a blue -> yellow -> green
	 * color for an outlet's slot dot, so it reads as a continuous live
	 * "how close is this slot to matching" meter, not just a flat green
	 * once officially matched. Scaled relative to the configured
	 * threshold, not the raw 0-100 level: no match at all (level 0) is
	 * blue, halfway to threshold is yellow, and reaching the threshold
	 * itself (a real match) is green - level continuing past threshold
	 * stays capped at green, since the slot is already fully "matched"
	 * at that point.
	 *
	 * @param {number} level 0-100 raw match level
	 * @param {number} threshold 0-100 configured match threshold
	 * @return {string} CSS color, e.g. "rgb(140,165,60)"
	 */
	function matchLevelToColor(level, threshold) {
		var clampedThreshold = Math.max(1, Math.min(100, threshold));
		var relative = level / clampedThreshold;
		relative = Math.max(0, Math.min(1, relative));

		var from, to, localT;
		if(relative <= 0.5) {
			from = DOT_COLOR_LOW;
			to = DOT_COLOR_MID;
			localT = relative / 0.5;
		}
		else {
			from = DOT_COLOR_MID;
			to = DOT_COLOR_HIGH;
			localT = (relative - 0.5) / 0.5;
		}

		return 'rgb(' + lerpChannel(from.r, to.r, localT) + ',' +
			lerpChannel(from.g, to.g, localT) + ',' +
			lerpChannel(from.b, to.b, localT) + ')';
	}

	return WidgetView.extend({
		typeID: 'PoseTrack',
		categories: ['generator'],
		className: 'posetrack',
		template: _.template(Template),
		trackModeCatalog: trackModeCatalog,

		ins: [],
		outs: [
			{title: 'out1', from: 'out1', to: 'out1'},
			{title: 'out2', from: 'out2', to: 'out2'},
			{title: 'out3', from: 'out3', to: 'out3'},
			{title: 'out4', from: 'out4', to: 'out4'},
		],
		sources: [],

		initialize: function(options) {
			WidgetView.prototype.initialize.call(this, options);

			// Internal-only state, not saved with the patch. Must exist
			// before the model.set(defaults) below - that triggers
			// 'change' synchronously (WidgetMulti's own initialize,
			// already run, already bound onModelChange/processSignalChain
			// to it), which reads these. Same ordering gotcha CLAUDE.md
			// documents.
			this.trueTimers = [undefined, undefined, undefined, undefined];
			this.falseTimers = [undefined, undefined, undefined, undefined];
			this.previousExamples = [[], [], [], []];
			this.recordingBuffer = [];
			this.recordStopTimer = undefined;
			this.recordStartMs = 0;
			this.mediaStream = null;
			this.landmarker = null;
			this.loadingLandmarker = null;
			this.videoEl = null;
			this.canvasEl = null;
			this.lastDetectMs = 0;

			var defaults = {
				title: 'PoseTrack',
				// Camera starts as soon as the widget is added (see
				// onRender) - unlike FaceTrack, there's no separate
				// external signal to gate it on, the whole point of this
				// widget is the camera. Unchecking pauses it, matching
				// every other widget's active checkbox.
				active: true,
				trackMode: Object.keys(this.trackModeCatalog)[0],
				recording: false,
				recordSlot: 1,
				statusMessage: '',
				distance: 0,
				matchLevel: 0,
				// Mirrors Gesture's selectedTemplateLength - rivets
				// bindings are static keypaths, so the "more" panel can't
				// read a dynamically-named exampleCount<recordSlot> field
				// directly; kept in sync whenever recordSlot changes or
				// the selected slot is (re-)recorded.
				selectedExampleCount: 0,
				// Same static-keypath mirroring as selectedExampleCount
				// above, for slotName<recordSlot> - lets the "more" panel
				// show/edit a name for whichever slot is selected.
				selectedSlotName: '',
				// 0-100, updated per frame while recording (see
				// applyDetectionResult/toggleRecord/stopRecording) - drives
				// the recording progress bar so there's a clear, live
				// signal of how much of the burst is left, not just the
				// record button's own blink.
				recordingProgress: 0,
				recordingCountdownText: '',
				// Whichever slot most recently matched (see
				// commitMatched) - the name shown prominently in the
				// main body while actually using a trained widget.
				currentMatchName: '',
				threshold: 70,
				waitTimeTrue: 0,
				waitTimeFalse: 1000,
			};

			for(var i = 1; i <= SLOT_COUNT; i++) {
				// matched/ifState/ifMatch/ifNoMatch are live/config state,
				// not training data - shared across both tracking modes.
				// The training data itself (examples/exampleCount/
				// slotName) is mode-scoped instead - see the loop below
				// and getModeFieldKey().
				defaults['matched' + i] = false;
				defaults['ifState' + i] = 'falseOn';
				defaults['ifMatch' + i] = 1023;
				defaults['ifNoMatch' + i] = 0;
				// This slot's current outlet dot color (a CSS color
				// string, computed by matchLevelToColor()), updated every
				// frame for ALL slots (not just whichever is selected for
				// recording - see evaluateFrame), not just a raw number -
				// the color depends on both the match level AND the
				// configured threshold, so it's simplest to compute the
				// final string once, where both are already at hand,
				// rather than recomputing it again in a rivets binder
				// that only sees one bound value at a time.
				defaults['dotColor' + i] = '#ccc';
			}

			// Hand and Body poses live in incompatible feature spaces
			// (different landmark counts/normalization - see
			// trackModeCatalog.js), so each mode keeps its OWN
			// examples/exampleCount/slotName per slot (e.g. "examplesHand2",
			// "examplesBody2") rather than sharing one set that gets wiped
			// on every switch - see getModeFieldKey(). Switching modes just
			// changes which set is active/displayed; nothing recorded is
			// ever lost.
			_.each(this.trackModeCatalog, function(entry) {
				for(var slotIndex = 1; slotIndex <= SLOT_COUNT; slotIndex++) {
					// Unlike Gesture's single flat template array, each
					// slot here holds MULTIPLE recorded example vectors
					// (one per captured frame during that slot's recording
					// burst) - nearest-neighbor classification wants
					// several examples per class to capture natural pose
					// variation, not just one reference shape.
					defaults['examples' + entry.label + slotIndex] = [];
					defaults['exampleCount' + entry.label + slotIndex] = 0;
					defaults['slotName' + entry.label + slotIndex] = '';
				}
			});

			this.model.set(defaults);

			for(var s = 1; s <= SLOT_COUNT; s++) {
				this.model.set('out' + s, this.model.get('ifNoMatch' + s));
			}

			this.localFrameTick = function() {
				this.frameTick();
			}.bind(this);

			window.app.timingController.registerFrameCallback(this.localFrameTick, this);
		},

		onRender: function() {
			// Must be registered before WidgetView.prototype.onRender
			// below - see CLAUDE.md's Rivets/Backbone gotcha.
			if(!app.server) {
				rivets.formatters.pending = function(state) {
					return state === 'trueWaitStart';
				};
				rivets.formatters.isTrackMode = function(value, expected) {
					return value === expected;
				};
				// Used by both .recognitionBar (match level) and
				// .recordingBar (recording progress) below - rv-style-*
				// (WidgetMulti.js) divides by 100 for CSS properties like
				// opacity, not what a width percentage needs. Same
				// binder Gesture.js registers for its own identical
				// .recognitionBar - redefining it again here is harmless
				// (rivets.binders is one global registry), and necessary
				// in case this widget renders before Gesture ever does in
				// a given session, e.g. a patch with no Gesture widget in
				// it. This was actually missing until now - the bar has
				// been rendering at CSS's own default full-width the
				// whole time regardless of the real percentage, since an
				// unstyled block div's width already defaults to 100% of
				// its parent, which visually looked plausible but wasn't
				// actually reflecting anything.
				rivets.binders.widthpercent = function(el, value) {
					el.style.width = value + '%';
				};
				// Sets a CSS custom property (not a direct background-color
				// style) because the visible dot is drawn on .slotIndicator's
				// ::after pseudo-element (see Widget.scss) - JS can't set an
				// inline style directly on a pseudo-element, but a custom
				// property set on the real element IS visible to its own
				// ::after via CSS's var(--matchColor, ...) fallback syntax.
				// The bound value (dotColor<i>) is already a finished CSS
				// color string - see matchLevelToColor(), computed where
				// both the level AND the threshold are at hand (evaluateFrame).
				rivets.binders.matchcolor = function(el, value) {
					el.style.setProperty('--matchColor', value || '#ccc');
				};
			}

			WidgetView.prototype.onRender.call(this);

			if(!app.server) {
				this.videoEl = this.$('.poseVideo').get(0);
				this.canvasEl = this.$('.poseCanvas').get(0);
				this.slotPreviewEl = this.$('.slotPreview').get(0);
				this.populateTrackModeSelect();
				this.primeCameraPermission();

				if(this.model.get('active')) {
					this.startCamera();
				}

				// Reflect whichever slot is already selected (e.g.
				// restoring a saved patch) rather than waiting for the
				// user to first touch the slot selector.
				this.onRecordSlotChange();
			}
		},

		/**
		 * populateTrackModeSelect - fill the mode <select> from the
		 * shared catalog, same reasoning as GroveSensor's
		 * populateSensorSelect(): keeps the dropdown in sync with the
		 * catalog automatically if a mode is ever added, rather than
		 * hardcoding <option> tags in the template.
		 *
		 * @return {void}
		 */
		populateTrackModeSelect: function() {
			var $select = this.$('.trackModeSelect'),
				currentMode = this.model.get('trackMode');

			$select.empty();

			_.each(this.trackModeCatalog, function(entry, mode) {
				$select.append('<option value="' + mode + '">' + entry.label + '</option>');
			});

			$select.val(currentMode);
		},

		// Requests camera access once, immediately, right when the widget
		// is added to the canvas - rather than waiting until a recording
		// is attempted and only discovering then whether permission is
		// even granted. Opens and instantly closes the stream (no frames
		// are ever read from it) purely to surface the OS permission
		// prompt early; the real, kept-open stream is only opened/closed
		// by startCamera/stopCamera. Same pattern as FaceTrack.js.
		primeCameraPermission: function() {
			var self = this;
			navigator.mediaDevices.getUserMedia({video: true, audio: false})
				.then(function(stream) {
					stream.getTracks().forEach(function(track) {
						track.stop();
					});
				})
				.catch(function(err) {
					self.model.set('statusMessage', 'Camera permission needed: ' + err.message);
				});
		},

		onRemove: function() {
			window.app.timingController.removeFrameCallback(this.localFrameTick, this);
			for(var i = 0; i < SLOT_COUNT; i++) {
				clearTimeout(this.trueTimers[i]);
				clearTimeout(this.falseTimers[i]);
			}
			clearTimeout(this.recordStopTimer);
			this.stopCamera();
			if(this.landmarker) {
				this.landmarker.close();
			}
		},

		widgetEvents: {
			'click .recordIcon': 'toggleRecord',
			'change .recordSlot': 'onRecordSlotChange',
			'change .slotNameInput': 'onSlotNameInputChange',
			'change .trackModeSelect': 'onTrackModeSelectChange',
		},

		// The mode <select> is populated manually (populateTrackModeSelect)
		// rather than via rv-value, since its <option>s themselves are built
		// from trackModeCatalog rather than declared in the template - so,
		// unlike recordSlot/slotNameInput, picking a new mode needs an
		// explicit handler to push the choice into the model. Without this,
		// the dropdown's own visible value changes but trackMode never does,
		// so onModelChange never sees changed.trackMode and switchTrackMode()
		// never runs - which is exactly why switching to Body appeared to do
		// nothing.
		onTrackModeSelectChange: function() {
			this.model.set('trackMode', this.$('.trackModeSelect').val());
		},

		/**
		 * getModeFieldKey - builds the mode-scoped model field name for
		 * per-slot training data (examples/exampleCount/slotName), so
		 * Hand and Body each keep their own set instead of sharing one
		 * that gets wiped on every mode switch (see initialize() and
		 * switchTrackMode()). Uses the catalog entry's own `label`
		 * (already capitalized, e.g. "Hand"/"Body") as the mode suffix.
		 *
		 * @param {string} prefix e.g. 'examples', 'exampleCount', 'slotName'
		 * @param {number} slot 1-4
		 * @return {string} model field name, e.g. 'examplesBody2'
		 */
		getModeFieldKey: function(prefix, slot) {
			var entry = this.trackModeCatalog[this.model.get('trackMode')];
			return prefix + entry.label + slot;
		},

		onRecordSlotChange: function() {
			var slot = parseInt(this.model.get('recordSlot'), 10);
			this.model.set({
				selectedExampleCount: this.model.get(this.getModeFieldKey('exampleCount', slot)),
				selectedSlotName: this.model.get(this.getModeFieldKey('slotName', slot)),
			});
			this.drawSlotPreview();
		},

		// selectedSlotName is a plain mirror (see its comment in
		// initialize()) - rivets' rv-value on the "more" panel's text
		// input keeps it in sync with what's typed, this writes that
		// back to the actual per-slot field it's mirroring.
		onSlotNameInputChange: function() {
			var slot = parseInt(this.model.get('recordSlot'), 10);
			this.model.set(this.getModeFieldKey('slotName', slot), this.model.get('selectedSlotName'));
		},

		// ifMatch<slot>/ifNoMatch<slot> are otherwise only read at the
		// moment a match/no-match transition commits (see commitMatched)
		// - editing one in the "more" panel while a slot is just sitting
		// in that same state wouldn't touch out<slot> until the next
		// actual transition, which reads as "the field doesn't do
		// anything". Push it through immediately if the slot is
		// currently sitting in the state that field applies to. Verbatim
		// reuse of Gesture.js's identical onModelChange logic, plus
		// active/trackMode handling PoseTrack needs that Gesture doesn't.
		onModelChange: function(model) {
			var changed = model.changedAttributes();

			if(changed.active !== undefined) {
				if(this.model.get('active')) {
					this.startCamera();
				}
				else {
					this.stopCamera();
				}
			}

			if(changed.trackMode !== undefined) {
				this.switchTrackMode();
			}

			for(var i = 1; i <= SLOT_COUNT; i++) {
				var ifState = this.model.get('ifState' + i);

				if(changed['ifMatch' + i] !== undefined && ifState === 'trueOn') {
					this.model.set('out' + i, changed['ifMatch' + i]);
				}
				if(changed['ifNoMatch' + i] !== undefined && ifState !== 'trueOn') {
					this.model.set('out' + i, changed['ifNoMatch' + i]);
				}
			}
		},

		/**
		 * switchTrackMode - hand and body poses live in completely
		 * different feature spaces (21 hand landmarks vs. 33 body
		 * landmarks, different normalization reference points), so an
		 * example recorded in one mode is meaningless in the other -
		 * but each mode keeps its OWN examples/exampleCount/slotName
		 * (see getModeFieldKey), so nothing is actually destroyed here,
		 * only the transient/live match state (which mode's examples
		 * are even relevant to it changed) and the selected-slot mirror
		 * fields, refreshed for the new mode's own data. Disposes the
		 * current landmarker - a new one is created lazily, for the new
		 * mode, next time one is needed (see ensureLandmarker).
		 *
		 * @return {void}
		 */
		switchTrackMode: function() {
			if(this.landmarker) {
				this.landmarker.close();
				this.landmarker = null;
			}
			this.loadingLandmarker = null;

			this.model.set({statusMessage: '', distance: 0, matchLevel: 0, currentMatchName: ''});

			// Recomputes selectedExampleCount/selectedSlotName from the
			// NEW mode's own data for whichever slot is currently
			// selected (not just reset to empty), and redraws the slot
			// preview to match.
			this.onRecordSlotChange();

			// ensureLandmarker() is otherwise only called from startCamera(),
			// which already ran once when the widget first became active and
			// won't run again just because the mode changed. Without this,
			// this.landmarker stays null after a mode switch and frameTick()'s
			// own early-return guard (`if(!this.landmarker ...) return`) means
			// detection silently stops for good - no dots, no matches, no
			// error - until the widget is deactivated and reactivated. Only
			// worth doing if the camera is actually running; otherwise the
			// next startCamera() call will load the right mode's landmarker
			// itself.
			if(this.mediaStream) {
				this.ensureLandmarker();
			}
		},

		/**
		 * toggleRecord - starts (or, called again, early-stops) a
		 * recording burst for the currently-selected slot. See
		 * RECORD_BURST_MS's comment for why this is a timed burst rather
		 * than Gesture's manual start/stop toggle.
		 *
		 * @return {void}
		 */
		toggleRecord: function() {
			if(this.model.get('recording')) {
				this.stopRecording();
				return;
			}

			var slot = parseInt(this.model.get('recordSlot'), 10);
			this.recordingBuffer = [];
			this.previousExamples[slot - 1] = this.model.get(this.getModeFieldKey('examples', slot));
			this.recordStartMs = Date.now();
			this.model.set({recording: true, statusMessage: '', recordingProgress: 0, recordingCountdownText: this.formatCountdown(RECORD_BURST_MS)});

			clearTimeout(this.recordStopTimer);
			this.recordStopTimer = setTimeout(this.stopRecording.bind(this), RECORD_BURST_MS);
		},

		/**
		 * formatCountdown - "1.3s left"-style text for the recording
		 * countdown readout.
		 *
		 * @param {number} remainingMs
		 * @return {string}
		 */
		formatCountdown: function(remainingMs) {
			return (Math.max(0, remainingMs) / 1000).toFixed(1) + 's left';
		},

		stopRecording: function() {
			clearTimeout(this.recordStopTimer);

			var slot = parseInt(this.model.get('recordSlot'), 10);
			var examplesKey = this.getModeFieldKey('examples', slot);
			var countKey = this.getModeFieldKey('exampleCount', slot);

			if(this.recordingBuffer.length < MIN_EXAMPLES_PER_RECORDING) {
				// Too few valid frames captured (e.g. the hand/body was
				// barely ever actually detected during the burst) -
				// restore whatever was previously trained rather than
				// leaving the slot empty or under-trained, matching
				// Gesture's "restore, don't destroy, on a failed
				// re-recording" behavior.
				var restore = {recording: false, statusMessage: "Didn't see the pose enough - try again", recordingProgress: 0};
				restore[examplesKey] = this.previousExamples[slot - 1];
				restore[countKey] = this.previousExamples[slot - 1].length;
				this.model.set(restore);
			}
			else {
				var update = {recording: false, statusMessage: '', recordingProgress: 0};
				update[examplesKey] = this.recordingBuffer;
				update[countKey] = this.recordingBuffer.length;
				this.model.set(update);
			}

			this.onRecordSlotChange();
			this.recordingBuffer = [];
		},

		/**
		 * extractFeatureVector - normalizes a raw landmark array into a
		 * translation/scale-invariant flat vector (x,y per landmark) so
		 * the same pose reads consistently regardless of the subject's
		 * position/distance from the camera. See trackModeCatalog.js for
		 * which landmarks define the origin/scale reference per mode.
		 *
		 * @param {Array} landmarks raw {x,y,z} landmark array
		 * @return {Array} flat [x0,y0,x1,y1,...] normalized vector
		 */
		extractFeatureVector: function(landmarks) {
			var entry = this.trackModeCatalog[this.model.get('trackMode')];
			var origin = averagePoint(landmarks, entry.originIndices);
			var scaleRef = averagePoint(landmarks, entry.scaleReferenceIndices);
			// Guards against a degenerate divide-by-zero if the origin
			// and scale-reference landmarks ever land on the same point.
			var scale = distance2D(origin, scaleRef) || 1;

			var vector = [];
			for(var i = 0; i < landmarks.length; i++) {
				vector.push((landmarks[i].x - origin.x) / scale);
				vector.push((landmarks[i].y - origin.y) / scale);
			}
			return vector;
		},

		// A detected match starts the true-side transition for that
		// slot: if waitTimeTrue is 0 the output switches immediately,
		// otherwise it only switches once the match has stayed "pending"
		// for that long (mirrors IfThen/Gesture's waitTimeTrue). Either
		// way, once true, a separate timer (waitTimeFalse) switches it
		// back - called again every frame the pose stays matched (see
		// evaluateFrame), which keeps resetting that timer, so the
		// output only actually times out once the pose stops matching,
		// not merely once time passes while still held. Each slot's
		// timers are independent. Verbatim reuse of Gesture.js's
		// identical transition state machine.
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

			// Falls back to "Slot N" if the user hasn't typed a name in
			// for this slot yet (see selectedSlotName/getModeFieldKey).
			var displayName = this.model.get(this.getModeFieldKey('slotName', slot)) || ('Slot ' + slot);

			if(isMatched) {
				var trueUpdate = {};
				trueUpdate['matched' + slot] = true;
				trueUpdate['ifState' + slot] = 'trueOn';
				trueUpdate[outKey] = this.model.get('ifMatch' + slot);
				// Shown prominently in the main body (see template.js's
				// .currentMatch) - the most useful live readout once
				// you're actually using a trained widget, not just
				// training it. Always overwrites with whichever slot
				// most recently matched; see the else branch for why
				// that's a reasonable simplification even though two
				// slots' matched states could momentarily overlap
				// (independent waitTimeFalse timers).
				trueUpdate.currentMatchName = displayName;
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
				falseUpdate[outKey] = this.model.get('ifNoMatch' + slot);
				// Only clear the displayed name if THIS slot was the one
				// being shown - otherwise this slot's own timeout expiring
				// would wipe a *different*, still-active slot's name out
				// from under it.
				if(this.model.get('currentMatchName') === displayName) {
					falseUpdate.currentMatchName = '';
				}
				this.model.set(falseUpdate);
			}
		},

		/**
		 * evaluateFrame - 1-nearest-neighbor classification: the live
		 * vector's distance to every stored example in every trained
		 * slot, the single nearest example overall determines the
		 * candidate slot (mirrors Gesture's evaluateSegment, DTW swapped
		 * for a plain Euclidean nearest-neighbor search since this is
		 * static-pose, not motion, matching). Only the best-scoring slot
		 * above threshold fires, so one pose can't ambiguously trigger
		 * two outputs.
		 *
		 * @param {Array} vector normalized feature vector for this frame
		 * @return {void}
		 */
		evaluateFrame: function(vector) {
			var matchThreshold = parseFloat(this.model.get('threshold'));
			var selectedSlot = parseInt(this.model.get('recordSlot'), 10);
			var bestSlot = -1;
			var bestLevel = -1;
			// Batched into one model.set() below rather than per-slot
			// calls - every slot's dotColor updates every frame (not
			// just the selected one, see the outlet dot's color binding
			// in template.js/Widget.scss), so this would otherwise be up
			// to 4 separate 'change' events per frame.
			var frameUpdate = {};

			for(var slot = 1; slot <= SLOT_COUNT; slot++) {
				var examples = this.model.get(this.getModeFieldKey('examples', slot));
				if(!examples || examples.length === 0) {
					// Untrained (nothing recorded yet) is a different
					// situation from "trained but currently 0% matched" -
					// stays plain grey rather than blue, so an empty slot
					// doesn't look like it's actively reading a live level.
					frameUpdate['dotColor' + slot] = '#ccc';
					continue;
				}

				var minDistance = Infinity;
				for(var e = 0; e < examples.length; e++) {
					var d = euclideanDistance(vector, examples[e]);
					if(d < minDistance) {
						minDistance = d;
					}
				}

				var level = Math.max(0, Math.min(100, 100 * (1 - minDistance / MATCH_DISTANCE_SCALE)));
				frameUpdate['dotColor' + slot] = matchLevelToColor(level, matchThreshold);

				if(slot === selectedSlot) {
					frameUpdate.distance = minDistance;
					frameUpdate.matchLevel = level;
				}

				if(level >= matchThreshold && level > bestLevel) {
					bestLevel = level;
					bestSlot = slot;
				}
			}

			this.model.set(frameUpdate);

			if(bestSlot !== -1) {
				this.startTrueTransition(bestSlot);
			}
		},

		// Lazily created once per mode, reused across every frame until
		// the mode changes (switchTrackMode disposes it) - only the
		// camera stream itself (startCamera/stopCamera) opens/closes
		// with `active`; loading the WASM runtime + model is the
		// expensive part. Mirrors FaceTrack.js's ensureFaceLandmarker,
		// generalized to pick its MediaPipe class/model/count-option from
		// trackModeCatalog.js instead of being hardcoded to faces.
		ensureLandmarker: function() {
			if(this.landmarker) {
				return Promise.resolve(this.landmarker);
			}
			if(this.loadingLandmarker) {
				return this.loadingLandmarker;
			}

			var self = this;
			var entry = this.trackModeCatalog[this.model.get('trackMode')];

			this.loadingLandmarker = import(/* webpackIgnore: true */ VISION_BUNDLE_PATH)
				.then(function(vision) {
					return vision.FilesetResolver.forVisionTasks(WASM_BASE_PATH).then(function(filesetResolver) {
						var landmarkerOptions = {
							baseOptions: {
								modelAssetPath: entry.modelPath,
								delegate: 'GPU',
							},
							runningMode: 'VIDEO',
						};
						landmarkerOptions[entry.countOptionKey] = 1;

						var LandmarkerClass = vision[entry.landmarkerClass];
						return LandmarkerClass.createFromOptions(filesetResolver, landmarkerOptions);
					});
				})
				.then(function(landmarker) {
					self.landmarker = landmarker;
					self.loadingLandmarker = null;
					return landmarker;
				})
				.catch(function(err) {
					self.loadingLandmarker = null;
					self.model.set('statusMessage', 'Tracking failed to load: ' + err.message);
					throw err;
				});

			return this.loadingLandmarker;
		},

		// Privacy/CPU: the camera stream opens/closes with `active`,
		// same bounded-active-time spirit as FaceTrack/SpeechIn.
		startCamera: function() {
			var self = this;
			navigator.mediaDevices.getUserMedia({video: {width: 320, height: 240}, audio: false})
				.then(function(stream) {
					self.mediaStream = stream;
					if(self.videoEl) {
						self.videoEl.srcObject = stream;
						self.videoEl.play();
					}
					return self.ensureLandmarker();
				})
				.catch(function(err) {
					self.model.set({
						statusMessage: 'Camera error: ' + err.message,
						active: false,
					});
					self.stopCamera();
				});
		},

		stopCamera: function() {
			if(this.mediaStream) {
				this.mediaStream.getTracks().forEach(function(track) {
					track.stop();
				});
				this.mediaStream = null;
			}
			if(this.videoEl) {
				this.videoEl.srcObject = null;
			}
			this.drawOverlay(null);
		},

		frameTick: function() {
			if(!this.model.get('active')) {
				return;
			}
			if(!this.landmarker || !this.videoEl || this.videoEl.readyState < 2) {
				return;
			}

			var now = performance.now();
			if(now - this.lastDetectMs < DETECT_INTERVAL_MS) {
				return;
			}
			this.lastDetectMs = now;

			// Timing.js's tick() calls every registered widget's frame
			// callback in a single loop with no try/catch - an uncaught
			// throw here wouldn't just break this widget, it would kill
			// the requestAnimationFrame chain for every widget in the
			// patch (nothing re-schedules the next tick). Never let
			// detectForVideo take the whole app's timing loop down with
			// it. Same discipline as FaceTrack.js's frameTick.
			try {
				var result = this.landmarker.detectForVideo(this.videoEl, now);
				this.applyDetectionResult(result);
			}
			catch(err) {
				this.model.set('statusMessage', 'Detection error: ' + err.message);
			}
		},

		applyDetectionResult: function(result) {
			// HandLandmarkerResult and PoseLandmarkerResult both expose
			// the same `.landmarks` shape (an array of detected hands/
			// bodies, each an array of {x,y,z} points) - this code is
			// entirely generic across both tracking modes.
			var landmarks = result.landmarks && result.landmarks[0];

			if(!landmarks || landmarks.length === 0) {
				this.drawOverlay(null);
				return;
			}

			this.drawOverlay(landmarks);

			var vector = this.extractFeatureVector(landmarks);

			if(this.model.get('recording')) {
				this.recordingBuffer.push(vector);

				var elapsedMs = Date.now() - this.recordStartMs;
				this.model.set({
					selectedExampleCount: this.recordingBuffer.length,
					recordingProgress: Math.max(0, Math.min(100, (elapsedMs / RECORD_BURST_MS) * 100)),
					recordingCountdownText: this.formatCountdown(RECORD_BURST_MS - elapsedMs),
				});
				return;
			}

			var anyExamples = false;
			for(var s = 1; s <= SLOT_COUNT; s++) {
				if(this.model.get(this.getModeFieldKey('examples', s)).length > 0) {
					anyExamples = true;
					break;
				}
			}
			if(!anyExamples) {
				return;
			}

			this.evaluateFrame(vector);
		},

		drawOverlay: function(landmarks) {
			if(!this.canvasEl) {
				return;
			}
			var ctx = this.canvasEl.getContext('2d');
			ctx.clearRect(0, 0, this.canvasEl.width, this.canvasEl.height);
			if(!landmarks) {
				return;
			}
			ctx.fillStyle = '#00ff88';
			for(var i = 0; i < landmarks.length; i++) {
				var px = landmarks[i].x * this.canvasEl.width;
				var py = landmarks[i].y * this.canvasEl.height;
				ctx.fillRect(px - 1, py - 1, 2, 2);
			}
		},

		/**
		 * drawSlotPreview - draws a small skeleton (dots + connecting
		 * lines, from trackModeCatalog.js's per-mode connections list)
		 * for the currently-selected slot's first recorded example, so
		 * it's clear at a glance what pose is actually trained into that
		 * slot without needing to re-perform it. Deliberately reconstructs
		 * this from the already-stored normalized landmark vector rather
		 * than saving an actual camera frame - relative landmark geometry
		 * alone is enough to draw a recognizable shape, and it means no
		 * photo of whoever trained the widget ends up saved in the patch
		 * file. Called whenever the selected slot changes or is
		 * (re-)recorded (see onRecordSlotChange/switchTrackMode).
		 *
		 * @return {void}
		 */
		drawSlotPreview: function() {
			if(!this.slotPreviewEl) {
				return;
			}

			var ctx = this.slotPreviewEl.getContext('2d');
			var w = this.slotPreviewEl.width, h = this.slotPreviewEl.height;
			ctx.clearRect(0, 0, w, h);

			var slot = parseInt(this.model.get('recordSlot'), 10);
			var examples = this.model.get(this.getModeFieldKey('examples', slot));
			if(!examples || examples.length === 0) {
				return;
			}

			var vector = examples[0];
			var entry = this.trackModeCatalog[this.model.get('trackMode')];

			// The stored vector is normalized (translated/scaled - see
			// extractFeatureVector) but its exact numeric range isn't
			// fixed or known in advance, so fit it to the canvas
			// dynamically each time rather than assuming a range - this
			// keeps the drawing a sensible size regardless of the actual
			// pose/proportions recorded.
			var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
			for(var i = 0; i < entry.landmarkCount; i++) {
				var x = vector[i * 2], y = vector[i * 2 + 1];
				if(x < minX) { minX = x; }
				if(x > maxX) { maxX = x; }
				if(y < minY) { minY = y; }
				if(y > maxY) { maxY = y; }
			}
			var rangeX = (maxX - minX) || 1;
			var rangeY = (maxY - minY) || 1;
			var padding = 6;

			function toCanvas(px, py) {
				return {
					x: padding + ((px - minX) / rangeX) * (w - padding * 2),
					y: padding + ((py - minY) / rangeY) * (h - padding * 2),
				};
			}

			ctx.strokeStyle = '#4caf50';
			ctx.lineWidth = 1.5;
			for(var c = 0; c < entry.connections.length; c++) {
				var from = entry.connections[c][0], to = entry.connections[c][1];
				var p1 = toCanvas(vector[from * 2], vector[from * 2 + 1]);
				var p2 = toCanvas(vector[to * 2], vector[to * 2 + 1]);
				ctx.beginPath();
				ctx.moveTo(p1.x, p1.y);
				ctx.lineTo(p2.x, p2.y);
				ctx.stroke();
			}

			ctx.fillStyle = '#2e7d32';
			for(var l = 0; l < entry.landmarkCount; l++) {
				var p = toCanvas(vector[l * 2], vector[l * 2 + 1]);
				ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
			}
		},

	});
});
