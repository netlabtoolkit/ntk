define([
	'backbone',
	'rivets',
	'views/item/WidgetMulti',
	'text!./template.js',
	'utils/MatchColor',
],
function(Backbone, rivets, WidgetView, Template, MatchColor){
	'use strict';

	// Up to 4 independently-trained objects, each with its own outlet -
	// same shape as PoseRecog/Gesture's SLOT_COUNT.
	var SLOT_COUNT = 4;
	// A "record" click captures a burst of frames over this window
	// (Teachable Machine-style "hold the object in view while it
	// samples"). Can be stopped early by clicking again.
	// 5s (longer than PoseRecog's 2s) so there's time to slowly turn the
	// object and vary its distance while it samples - a spread of views
	// helps 1-NN recognition far more than a longer burst of one still
	// view would. The "more" panel prompts for this.
	var RECORD_BURST_MS = 5000;
	// "Get ready" countdown before the capture burst actually starts, so
	// there's time to position the object. Cancellable by clicking again.
	var PRE_RECORD_COUNTDOWN_MS = 3000;
	// Fewer valid frames than this during a burst rejects the recording
	// (mirrors PoseRecog) - though with whole-frame embedding every frame
	// yields a vector, so this really only trips if the camera stalled.
	var MIN_EXAMPLES_PER_RECORDING = 5;
	// Detector + embedder per frame is heavier than a single landmarker,
	// so a slightly slower cadence than PoseRecog's 50ms (~10fps). An
	// object's identity doesn't change frame-to-frame the way a gesture
	// does, so this is plenty responsive.
	var DETECT_INTERVAL_MS = 100;
	// 1-NN cosine distance -> 0-100% match level. MediaPipe's MobileNet
	// embeddings are L2-normalized, so cosine distance lands in roughly
	// [0, 1]; the same object tends to sit near 0.05-0.2 and a different
	// object further out. This is a STARTING ESTIMATE for "0% match", not
	// an empirically-tuned constant - needs live-camera calibration. If
	// real matches consistently read too high/low, adjust this first.
	var MATCH_DISTANCE_SCALE = 0.4;
	// ObjectDetector tuning - only reasonably-confident boxes, and a
	// handful at most (the widget only ever uses the largest).
	var DETECTOR_SCORE_THRESHOLD = 0.35;
	var DETECTOR_MAX_RESULTS = 5;

	// Bundled locally by buildScripts/fetchMediaPipeAssets.sh into
	// server/assets/mediapipe/ (served at /assets - see routes.js), never
	// from Google's CDN. Same shared Tasks-Vision WASM runtime FaceTrack/
	// PoseRecog use - only the model files are new.
	//
	// Root-relative (leading '/'), not a RequireJS bare path - dynamic
	// import() is the browser's own ES module loader, separate from
	// RequireJS resolution (see PoseRecog.js's fuller note).
	var VISION_BUNDLE_PATH = '/assets/mediapipe/vision_bundle.mjs';
	var WASM_BASE_PATH = '/assets/mediapipe/wasm';
	var DETECTOR_MODEL_PATH = '/assets/mediapipe/models/efficientdet_lite0.tflite';
	var EMBEDDER_MODEL_PATH = '/assets/mediapipe/models/mobilenet_v3_small.tflite';

	// Cosine distance between two plain number[] embeddings (1 - cosine
	// similarity). Full formula rather than a bare dot product in case a
	// model ever isn't unit-norm.
	function cosineDistance(a, b) {
		var dot = 0, na = 0, nb = 0;
		for(var i = 0; i < a.length; i++) {
			dot += a[i] * b[i];
			na += a[i] * a[i];
			nb += b[i] * b[i];
		}
		var denom = Math.sqrt(na) * Math.sqrt(nb) || 1;
		return 1 - (dot / denom);
	}

	return WidgetView.extend({
		typeID: 'ObjectRecog',
		categories: ['AI'],
		className: 'objectrecog',
		template: _.template(Template),

		ins: [],
		// Two string outlets only (widget-body height caps it at 4 nubs and
		// these two carry everything useful): `match` = the name of
		// whichever of the 4 trained slots is currently recognised (''
		// when none), `label` = the top COCO class in view. Both set
		// directly (from === to). Branch downstream on the name with
		// IfThen / Gate. The 4 slots still train independently; the dots
		// in the body show which is matching.
		outs: [
			{title: 'match', from: 'currentMatchName', to: 'currentMatchName'},
			{title: 'label', from: 'cocoLabel', to: 'cocoLabel'},
		],
		sources: [],

		widgetEvents: {
			'click .recordIcon': 'toggleRecord',
			'change .recordSlot': 'onRecordSlotChange',
			'change .slotNameInput': 'onSlotNameInputChange',
			'click .testImageButton': 'testWithImageFile',
			// useDetectorCrop is two-way bound via rv-checked - no handler
			// needed; it's read fresh every frame in processFrame().
		},

		initialize: function(options) {
			WidgetView.prototype.initialize.call(this, options);

			// Internal-only state, not saved with the patch. Must exist
			// before model.set(defaults) below - that fires 'change'
			// synchronously (WidgetMulti bound onModelChange already), and
			// the CLAUDE.md ordering gotcha applies.
			this.trueTimers = [undefined, undefined, undefined, undefined];
			this.falseTimers = [undefined, undefined, undefined, undefined];
			this.previousExamples = [[], [], [], []];
			this.previousPreviews = ['', '', '', ''];
			this.recordingBuffer = [];
			this.pendingPreview = '';
			this.recordStopTimer = undefined;
			this.recordStartMs = 0;
			this.countdownTickTimer = undefined;
			this.countdownStartMs = 0;
			this.mediaStream = null;
			this.detector = null;
			this.embedder = null;
			this.loadingModels = null;
			this.videoEl = null;
			this.canvasEl = null;
			this.cropCanvas = null;
			this.lastDetectMs = 0;
			// MediaPipe VIDEO mode demands strictly-increasing timestamps
			// across every *ForVideo call (frame loop AND the test-image
			// path), so both draw from this counter, not performance.now().
			this.mpTs = 0;

			var defaults = {
				title: 'ObjectRecog',
				active: true,
				recording: false,
				countingDown: false,
				recordSlot: 1,
				statusMessage: '',
				distance: 0,
				matchLevel: 0,
				selectedExampleCount: 0,
				selectedSlotName: '',
				selectedPreview: '',
				recordingProgress: 0,
				recordingCountdownText: '',
				// Whichever trained slot most recently matched - shown in
				// the body and emitted from the `match` outlet.
				currentMatchName: '',
				// Live top COCO class from the detector - shown in the
				// body and emitted from the `label` outlet. Empty when
				// nothing recognisable is in frame (or the object isn't
				// one of the 80 COCO classes - a trained slot can still
				// recognise it).
				cocoLabel: '',
				cocoConfidence: 0,
				// When on (default), the embedding is taken from the
				// detected object's bounding box rather than the whole
				// frame - localised and much less swayed by background.
				// Falls back to whole-frame automatically when nothing is
				// detected.
				useDetectorCrop: true,
				// The detector almost always sees the person holding the
				// object up as the biggest thing in frame. On (default),
				// 'person' detections are skipped so the label / crop lock
				// onto the object instead. Turn off to recognise people
				// as objects (not really what this widget is for).
				ignorePeople: true,
				threshold: 65,
				waitTimeTrue: 0,
				waitTimeFalse: 1000,
			};

			for(var i = 1; i <= SLOT_COUNT; i++) {
				// matched/ifState drive the body dot + which name goes to
				// the `match` outlet; there's no per-slot numeric outlet
				// any more, so no ifMatch/ifNoMatch values.
				defaults['matched' + i] = false;
				defaults['ifState' + i] = 'falseOn';
				defaults['dotColor' + i] = '#ccc';
				// Each slot holds MULTIPLE recorded embeddings (one per
				// captured frame) - 1-NN wants several examples per class.
				defaults['examples' + i] = [];
				defaults['exampleCount' + i] = 0;
				defaults['slotName' + i] = '';
				// A small JPEG data-URL thumbnail of the object as it
				// looked when the slot was trained - unlike PoseRecog's
				// reconstructed skeleton this is a real (cropped) photo,
				// so it does end up in the patch file; kept tiny.
				defaults['preview' + i] = '';
			}

			this.model.set(defaults);

			this.localFrameTick = function() {
				this.frameTick();
			}.bind(this);

			window.app.timingController.registerFrameCallback(this.localFrameTick, this);
		},

		onRender: function() {
			// Custom binders must be registered before
			// WidgetView.prototype.onRender - CLAUDE.md Rivets gotcha.
			if(!app.server) {
				rivets.formatters.pending = function(state) {
					return state === 'trueWaitStart';
				};
				rivets.formatters.or = function(a, b) {
					return !!(a || b);
				};
				// Shared with PoseRecog/Gesture - redefining on a global
				// registry is harmless and needed if this widget renders
				// first in a session.
				rivets.binders.widthpercent = function(el, value) {
					el.style.width = value + '%';
				};
				rivets.binders.matchcolor = function(el, value) {
					el.style.setProperty('--matchColor', value || '#ccc');
				};
			}

			WidgetView.prototype.onRender.call(this);

			if(!app.server) {
				this.videoEl = this.$('.objectVideo').get(0);
				this.canvasEl = this.$('.objectCanvas').get(0);
				this.cropCanvas = document.createElement('canvas');
				this.primeCameraPermission();

				if(this.model.get('active')) {
					this.startCamera();
				}

				this.onRecordSlotChange();
			}
		},

		// Surface the OS camera prompt early rather than at first record.
		// Same pattern as FaceTrack/PoseRecog.
		primeCameraPermission: function() {
			var self = this;
			navigator.mediaDevices.getUserMedia({video: true, audio: false})
				.then(function(stream) {
					stream.getTracks().forEach(function(track) { track.stop(); });
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
			clearInterval(this.countdownTickTimer);
			this.stopCamera();
			if(this.detector) { this.detector.close(); }
			if(this.embedder) { this.embedder.close(); }
		},

		onModelChange: function(model) {
			var changed = model.changedAttributes();

			if(changed.active !== undefined) {
				if(this.model.get('active')) { this.startCamera(); }
				else { this.stopCamera(); }
			}
		},

		// ---- record slot / name mirrors (static-keypath dance, same as
		// PoseRecog's selectedExampleCount/selectedSlotName) ----

		onRecordSlotChange: function() {
			var slot = parseInt(this.model.get('recordSlot'), 10);
			this.model.set({
				selectedExampleCount: this.model.get('exampleCount' + slot),
				selectedSlotName: this.model.get('slotName' + slot),
				selectedPreview: this.model.get('preview' + slot),
			});
		},

		onSlotNameInputChange: function() {
			var slot = parseInt(this.model.get('recordSlot'), 10);
			this.model.set('slotName' + slot, this.model.get('selectedSlotName'));
		},

		// ---- record burst / countdown (same shape as PoseRecog) ----

		toggleRecord: function() {
			if(this.model.get('countingDown')) { this.cancelCountdown(); return; }
			if(this.model.get('recording')) { this.stopRecording(); return; }
			this.startCountdown();
		},

		startCountdown: function() {
			var self = this;
			this.countdownStartMs = Date.now();
			this.model.set({countingDown: true, statusMessage: '', recordingCountdownText: this.formatCountdown(PRE_RECORD_COUNTDOWN_MS)});

			clearInterval(this.countdownTickTimer);
			this.countdownTickTimer = setInterval(function() {
				var remaining = PRE_RECORD_COUNTDOWN_MS - (Date.now() - self.countdownStartMs);
				if(remaining <= 0) { self.finishCountdown(); }
				else { self.model.set('recordingCountdownText', self.formatCountdown(remaining)); }
			}, 100);
		},

		cancelCountdown: function() {
			clearInterval(this.countdownTickTimer);
			this.model.set({countingDown: false, recordingCountdownText: ''});
		},

		finishCountdown: function() {
			clearInterval(this.countdownTickTimer);
			this.model.set('countingDown', false);
			this.beginRecordingBurst();
		},

		beginRecordingBurst: function() {
			var slot = parseInt(this.model.get('recordSlot'), 10);
			this.recordingBuffer = [];
			this.pendingPreview = '';
			this.previousExamples[slot - 1] = this.model.get('examples' + slot);
			this.previousPreviews[slot - 1] = this.model.get('preview' + slot);
			this.recordStartMs = Date.now();
			this.model.set({recording: true, statusMessage: '', recordingProgress: 0, recordingCountdownText: this.formatCountdown(RECORD_BURST_MS)});

			clearTimeout(this.recordStopTimer);
			this.recordStopTimer = setTimeout(this.stopRecording.bind(this), RECORD_BURST_MS);
		},

		formatCountdown: function(remainingMs) {
			return (Math.max(0, remainingMs) / 1000).toFixed(1) + 's left';
		},

		stopRecording: function() {
			clearTimeout(this.recordStopTimer);
			var slot = parseInt(this.model.get('recordSlot'), 10);

			if(this.recordingBuffer.length < MIN_EXAMPLES_PER_RECORDING) {
				var restore = {recording: false, statusMessage: "Didn't get a clear look - try again", recordingProgress: 0};
				restore['examples' + slot] = this.previousExamples[slot - 1];
				restore['exampleCount' + slot] = this.previousExamples[slot - 1].length;
				restore['preview' + slot] = this.previousPreviews[slot - 1];
				this.model.set(restore);
			}
			else {
				var update = {recording: false, statusMessage: '', recordingProgress: 0};
				update['examples' + slot] = this.recordingBuffer;
				update['exampleCount' + slot] = this.recordingBuffer.length;
				update['preview' + slot] = this.pendingPreview || this.model.get('preview' + slot);
				this.model.set(update);
			}

			this.onRecordSlotChange();
			this.recordingBuffer = [];
			this.pendingPreview = '';
		},

		// ---- transition state machine (verbatim from PoseRecog/Gesture) ----

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
			var displayName = this.model.get('slotName' + slot) || ('Slot ' + slot);

			if(isMatched) {
				var trueUpdate = {};
				trueUpdate['matched' + slot] = true;
				trueUpdate['ifState' + slot] = 'trueOn';
				// This is what the `match` outlet emits.
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
				// Only clear the emitted name if THIS slot was the one
				// showing - another slot may still be matched.
				if(this.model.get('currentMatchName') === displayName) {
					falseUpdate.currentMatchName = '';
				}
				this.model.set(falseUpdate);
			}
		},

		// ---- 1-NN classification over embeddings ----

		evaluateFrame: function(vector) {
			var matchThreshold = parseFloat(this.model.get('threshold'));
			var selectedSlot = parseInt(this.model.get('recordSlot'), 10);
			var bestSlot = -1;
			var bestLevel = -1;
			var frameUpdate = {};

			for(var slot = 1; slot <= SLOT_COUNT; slot++) {
				var examples = this.model.get('examples' + slot);
				if(!examples || examples.length === 0) {
					frameUpdate['dotColor' + slot] = '#ccc';
					continue;
				}

				var minDistance = Infinity;
				for(var e = 0; e < examples.length; e++) {
					var d = cosineDistance(vector, examples[e]);
					if(d < minDistance) { minDistance = d; }
				}

				var level = Math.max(0, Math.min(100, 100 * (1 - minDistance / MATCH_DISTANCE_SCALE)));
				frameUpdate['dotColor' + slot] = MatchColor.matchLevelToColor(level, matchThreshold);

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

		// ---- MediaPipe model loading ----

		// Loads the detector and the embedder together (both are needed
		// every frame). Lazily, once - reused until the widget is
		// removed. Mirrors PoseRecog's ensureLandmarker.
		ensureModels: function() {
			if(this.detector && this.embedder) {
				return Promise.resolve();
			}
			if(this.loadingModels) {
				return this.loadingModels;
			}

			var self = this;
			this.loadingModels = import(/* webpackIgnore: true */ VISION_BUNDLE_PATH)
				.then(function(vision) {
					return vision.FilesetResolver.forVisionTasks(WASM_BASE_PATH).then(function(fileset) {
						return Promise.all([
							vision.ObjectDetector.createFromOptions(fileset, {
								baseOptions: { modelAssetPath: DETECTOR_MODEL_PATH, delegate: 'GPU' },
								runningMode: 'VIDEO',
								scoreThreshold: DETECTOR_SCORE_THRESHOLD,
								maxResults: DETECTOR_MAX_RESULTS,
							}),
							vision.ImageEmbedder.createFromOptions(fileset, {
								baseOptions: { modelAssetPath: EMBEDDER_MODEL_PATH, delegate: 'GPU' },
								runningMode: 'VIDEO',
							}),
						]);
					});
				})
				.then(function(pair) {
					self.detector = pair[0];
					self.embedder = pair[1];
					self.loadingModels = null;
				})
				.catch(function(err) {
					self.loadingModels = null;
					self.model.set('statusMessage', 'Recognition failed to load: ' + err.message);
					throw err;
				});

			return this.loadingModels;
		},

		startCamera: function() {
			var self = this;
			navigator.mediaDevices.getUserMedia({video: {width: 320, height: 240}, audio: false})
				.then(function(stream) {
					self.mediaStream = stream;
					if(self.videoEl) {
						self.videoEl.srcObject = stream;
						self.videoEl.play();
					}
					return self.ensureModels();
				})
				.catch(function(err) {
					self.model.set({statusMessage: 'Camera error: ' + err.message, active: false});
					self.stopCamera();
				});
		},

		stopCamera: function() {
			if(this.mediaStream) {
				this.mediaStream.getTracks().forEach(function(track) { track.stop(); });
				this.mediaStream = null;
			}
			if(this.videoEl) { this.videoEl.srcObject = null; }
			this.drawOverlay(null, null);
		},

		// ---- per-frame ----

		nextTs: function() {
			this.mpTs = Math.max(this.mpTs + 1, Math.round(performance.now()));
			return this.mpTs;
		},

		frameTick: function() {
			if(!this.model.get('active')) { return; }
			if(!this.detector || !this.embedder || !this.videoEl || this.videoEl.readyState < 2) { return; }

			var now = performance.now();
			if(now - this.lastDetectMs < DETECT_INTERVAL_MS) { return; }
			this.lastDetectMs = now;

			// Timing.js's tick() has no try/catch - an uncaught throw here
			// kills every widget's frame callbacks, not just this one.
			try {
				this.processFrame(this.videoEl);
			}
			catch(err) {
				this.model.set('statusMessage', 'Recognition error: ' + err.message);
			}
		},

		// Shared by the live frame loop and the "test with an image"
		// path. `source` is a <video> or an <img> (both work with the
		// VIDEO-mode tasks as long as timestamps keep increasing).
		processFrame: function(source) {
			var vw = source.videoWidth || source.naturalWidth || source.width;
			var vh = source.videoHeight || source.naturalHeight || source.height;

			var ts = this.nextTs();
			var detections = this.detector.detectForVideo(source, ts).detections;

			var primary = this.largestDetection(detections);

			// COCO label readout / outlet.
			if(primary && primary.categories && primary.categories.length) {
				this.model.set({
					cocoLabel: primary.categories[0].categoryName || '',
					cocoConfidence: Math.round((primary.categories[0].score || 0) * 100),
				});
			}
			else if(this.model.get('cocoLabel') !== '') {
				this.model.set({cocoLabel: '', cocoConfidence: 0});
			}

			// Region of interest: the detected box, unless the option is
			// off or nothing was detected (then whole frame).
			var roi;
			if(primary && primary.boundingBox && this.model.get('useDetectorCrop') && vw && vh) {
				var b = primary.boundingBox;
				roi = {
					left: Math.max(0, b.originX / vw),
					top: Math.max(0, b.originY / vh),
					right: Math.min(1, (b.originX + b.width) / vw),
					bottom: Math.min(1, (b.originY + b.height) / vh),
				};
				// A degenerate/inverted box would throw in embedForVideo.
				if(roi.right <= roi.left || roi.bottom <= roi.top) { roi = undefined; }
			}

			var opts = roi ? {regionOfInterest: roi} : undefined;
			var embResult = this.embedder.embedForVideo(source, this.nextTs(), opts);
			var embedding = embResult.embeddings && embResult.embeddings[0];
			if(!embedding || !embedding.floatEmbedding) { this.drawOverlay(source, primary); return; }
			var vector = embedding.floatEmbedding;

			if(this.model.get('recording')) {
				this.recordingBuffer.push(vector);
				if(!this.pendingPreview) {
					this.pendingPreview = this.captureThumb(source, roi, vw, vh);
				}
				var elapsedMs = Date.now() - this.recordStartMs;
				this.model.set({
					selectedExampleCount: this.recordingBuffer.length,
					recordingProgress: Math.max(0, Math.min(100, (elapsedMs / RECORD_BURST_MS) * 100)),
					recordingCountdownText: this.formatCountdown(RECORD_BURST_MS - elapsedMs),
				});
				this.drawOverlay(source, primary);
				return;
			}

			var anyExamples = false;
			for(var s = 1; s <= SLOT_COUNT; s++) {
				if((this.model.get('examples' + s) || []).length > 0) { anyExamples = true; break; }
			}
			if(anyExamples) {
				this.evaluateFrame(vector);
			}

			// After evaluateFrame, so the box label reflects this frame's
			// match, not the previous one.
			this.drawOverlay(source, primary);
		},

		// The primary detection: largest-area box (more stable for "the
		// object you're holding up" than highest score). With
		// `ignorePeople` on, 'person' boxes are skipped entirely - the
		// person holding the object is nearly always the biggest thing in
		// frame, so without this the widget just tracks the person. If
		// that leaves nothing (only people detected), returns null and the
		// caller falls back to a whole-frame embed with an empty label.
		largestDetection: function(detections) {
			var ignorePeople = this.model.get('ignorePeople');
			var best = null, bestArea = -1;
			for(var i = 0; i < (detections || []).length; i++) {
				var d = detections[i];
				var name = d.categories && d.categories[0] && d.categories[0].categoryName;
				if(ignorePeople && name === 'person') { continue; }
				var b = d.boundingBox;
				var area = b ? b.width * b.height : 0;
				if(area > bestArea) { bestArea = area; best = d; }
			}
			return best;
		},

		// Small JPEG data-URL of the object (cropped to the ROI when
		// there is one). Kept small - it goes into the patch file.
		captureThumb: function(source, roi, vw, vh) {
			try {
				var c = this.cropCanvas;
				c.width = 96; c.height = 96;
				var ctx = c.getContext('2d');
				var sx = 0, sy = 0, sw = vw, sh = vh;
				if(roi) {
					sx = roi.left * vw; sy = roi.top * vh;
					sw = (roi.right - roi.left) * vw; sh = (roi.bottom - roi.top) * vh;
				}
				ctx.drawImage(source, sx, sy, sw, sh, 0, 0, c.width, c.height);
				return c.toDataURL('image/jpeg', 0.6);
			}
			catch(e) { return ''; }
		},

		drawOverlay: function(source, primary) {
			if(!this.canvasEl) { return; }
			var ctx = this.canvasEl.getContext('2d');
			var cw = this.canvasEl.width, ch = this.canvasEl.height;
			ctx.clearRect(0, 0, cw, ch);
			if(!source || !primary || !primary.boundingBox) { return; }

			var vw = source.videoWidth || source.naturalWidth || source.width || 1;
			var vh = source.videoHeight || source.naturalHeight || source.height || 1;
			var b = primary.boundingBox;
			var x = (b.originX / vw) * cw, y = (b.originY / vh) * ch;
			var w = (b.width / vw) * cw, h = (b.height / vh) * ch;

			// A trained match (currentMatchName) takes the box label and is
			// drawn brighter/bold; otherwise the raw COCO class, dimmer.
			var matchName = this.model.get('currentMatchName');
			var cocoName = primary.categories && primary.categories[0] && primary.categories[0].categoryName;
			var label = matchName || cocoName;
			var matched = !!matchName;

			ctx.strokeStyle = matched ? '#2eff9e' : '#00e0a0';
			ctx.lineWidth = matched ? 3 : 2;
			ctx.strokeRect(x, y, w, h);

			if(label) {
				ctx.font = (matched ? 'bold 12px' : '11px') + ' sans-serif';
				var ty = Math.max(matched ? 14 : 11, y - 3);
				// A dark pill behind the text so it stays legible over any
				// part of the video frame.
				var tw = ctx.measureText(label).width;
				ctx.fillStyle = 'rgba(0,0,0,0.55)';
				ctx.fillRect(x, ty - (matched ? 12 : 10), tw + 6, matched ? 15 : 13);
				ctx.fillStyle = matched ? '#2eff9e' : '#bfffe6';
				ctx.fillText(label, x + 3, ty);
			}
		},

		// ---- test without a camera ----

		// Runs the same detect + embed + classify pipeline on a still
		// image chosen from disk, so a patch's classification / transition
		// logic can be built and checked before wiring up a camera. Same
		// /localImage route the Image widget uses.
		testWithImageFile: function() {
			if(app.server || !window.ntkElectron || !window.ntkElectron.pickImageFile) { return; }
			var self = this;
			window.ntkElectron.pickImageFile().then(function(filePath) {
				if(!filePath) { return; }
				return self.ensureModels().then(function() {
					var img = new Image();
					img.onload = function() {
						self.model.set('statusMessage', '');
						try { self.processFrame(img); }
						catch(err) { self.model.set('statusMessage', 'Test image error: ' + err.message); }
					};
					img.onerror = function() { self.model.set('statusMessage', "Couldn't load that image"); };
					img.src = '/localImage?path=' + encodeURIComponent(filePath);
				});
			});
		},

	});
});
