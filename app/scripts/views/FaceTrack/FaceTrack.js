define([
	'backbone',
	'rivets',
	'views/item/WidgetMulti',
	'text!./template.js',
	'jqueryknob',

	// If you would like signal processing classes and functions include them here
	'utils/SignalChainFunctions',
	'utils/SignalChainClasses',
],
function(Backbone, rivets, WidgetView, Template, jqueryknob, SignalChainFunctions, SignalChainClasses){
	'use strict';

	// x/y/smile are scaled from MediaPipe's native 0-1 range onto the
	// app-wide 0-1023 analog convention (AnalogIn/Servo/etc).
	var RANGE_MAX = 1023;
	// Throttles detectForVideo() calls inside the shared per-frame tick -
	// running inference on every display frame would be wasteful. Matches
	// Gesture's sampleIntervalMs convention (~20fps).
	var DETECT_INTERVAL_MS = 50;

	// Bundled locally (fetched by buildScripts/fetchMediaPipeAssets.sh into
	// server/assets/mediapipe/, served at /assets - see
	// server/modules/nlWebServer/routes.js) - never loaded from Google's CDN,
	// this app needs to work offline.
	//
	// Root-relative (leading '/'), not a RequireJS-style bare path: dynamic
	// import() is a browser-native ES module loader, completely separate
	// from RequireJS's baseUrl/paths resolution - a specifier that doesn't
	// start with '/', './', '../', or a full URL is a "bare specifier",
	// which only resolves via an import map (this app doesn't define one),
	// so it fails with "Failed to resolve module specifier".
	var VISION_BUNDLE_PATH = '/assets/mediapipe/vision_bundle.mjs';
	var WASM_BASE_PATH = '/assets/mediapipe/wasm';
	var MODEL_PATH = '/assets/mediapipe/models/face_landmarker.task';

	return WidgetView.extend({
		typeID: 'FaceTrack',
		categories: ['generator'],
		className: 'facetrack',
		template: _.template(Template),

		ins: [
			{title: 'in', to: 'in'},
		],
		// from === to (not a signalChainFunctions transform) - these are set
		// directly by frameTick/applySimulatedOutputs, same pattern as
		// Gesture's out1-4.
		outs: [
			{title: 'x', from: 'x', to: 'x'},
			{title: 'y', from: 'y', to: 'y'},
			{title: 'smile', from: 'smile', to: 'smile'},
			{title: 'faceDetected', from: 'faceDetected', to: 'faceDetected'},
		],
		sources: [],

		initialize: function(options) {
			WidgetView.prototype.initialize.call(this, options);

			// Internal-only state, not saved with the patch. Must exist before
			// the model.set(defaults) below - that triggers onModelChange
			// synchronously (WidgetMulti's own initialize, which just ran,
			// already bound it), which reads these.
			this.waitLastTrueState = false;
			this.waitLastFalseState = false;
			this.trueTimer = undefined;
			this.falseTimer = undefined;
			this.mediaStream = null;
			this.faceLandmarker = null;
			this.loadingLandmarker = null;
			this.videoEl = null;
			this.canvasEl = null;
			this.lastDetectMs = 0;

			this.model.set({
				title: 'FaceTrack',
				in: 0,
				// Lets hardware/wiring be set up without producing spurious
				// camera activity/output - same idea as Gesture/AnalogIn's
				// active checkbox. Independent from `tracking` below.
				active: true,
				threshold: 512,
				waitTimeTrue: 0,
				waitTimeFalse: 0,
				// Mirrors IfThen's ifState naming/shape: 'off', 'startWaiting',
				// 'on', 'stopWaiting'.
				trackingState: 'off',
				// Convenience boolean derived from trackingState - true only
				// for 'on' (see startTracking/stopTracking). Drives whether the
				// camera is actually open and the preview is shown.
				tracking: false,
				faceDetected: 0,
				x: 0,
				y: 0,
				smile: 0,
				// Manual override, so patch wiring can be tested without a
				// camera or a face in frame - same spirit as Gesture/Knob's
				// in-widget dial.
				simulate: false,
				simX: 512,
				simY: 512,
				simSmile: 0,
				simFaceDetected: true,
				statusMessage: '',
			});

			this.localFrameTick = function() {
				this.frameTick();
			}.bind(this);

			window.app.timingController.registerFrameCallback(this.localFrameTick, this);
		},

		onRender: function() {
			// Must be registered before WidgetView.prototype.onRender below -
			// see CLAUDE.md's Rivets/Backbone gotcha. Named uniquely
			// (faceTrackPending, not Gesture's `pending`) since
			// rivets.formatters is a single global registry shared by every
			// widget type - reusing Gesture's `pending` name here would
			// silently repoint Gesture's own out1-4 pending-blink to this
			// widget's (different) state values wherever both render.
			if(!app.server) {
				rivets.formatters.faceTrackPending = function(state) {
					return state === 'startWaiting' || state === 'stopWaiting';
				};
				// Same rivets.binders.knob implementation every other
				// dial-driven widget in this app registers (AnalogIn,
				// Gesture, Knob, Servo, etc.) - identical everywhere it's
				// defined, so redefining it again here is harmless.
				rivets.binders.knob = function(el, value) {
					el.value = value;
					$(el).val(parseInt(value, 10));
					$(el).trigger('change');
				};
				// Rivets' built-in rv-value binder only listens for
				// 'change' (fires on mouseup for <input type="range">, not
				// while dragging) - this is the same binder shape, just
				// listening for 'input' instead, so the simulate sliders
				// update continuously while being dragged.
				rivets.binders.rangevalue = {
					publishes: true,
					bind: function(el) {
						$(el).on('input', this.publish);
					},
					unbind: function(el) {
						$(el).off('input', this.publish);
					},
					routine: function(el, value) {
						var jqEl = $(el);
						if ((value != null ? value.toString() : undefined) !== jqEl.val()) {
							jqEl.val(value != null ? value : '');
						}
					}
				};
			}

			WidgetView.prototype.onRender.call(this);

			if(!app.server) {
				this.videoEl = this.$('.faceVideo').get(0);
				this.canvasEl = this.$('.faceCanvas').get(0);
				this.primeCameraPermission();

				// In-widget dial so `in` (and the threshold gate it drives)
				// can be exercised without wiring another widget - same
				// "test without hardware" precedent as Gesture/Knob's dial.
				this.$('.dial').knob({
					'fgColor': '#000000',
					'bgColor': '#ffffff',
					'inputColor': '#000000',
					'angleOffset': -125,
					'angleArc': 250,
					'width': 50,
					'height': 40,
					'font': "'Helvetica Neue', sans-serif",
					'displayInput': false,
					'min': 0,
					'max': 1023,
					'change': function(v) { this.model.set('in', parseInt(v, 10)); }.bind(this)
				});
			}
		},

		// Requests camera access once, immediately, right when the widget is
		// added to the canvas - rather than waiting for the user to actually
		// trip the threshold and only discovering then whether permission is
		// even granted. Opens and instantly closes the stream (no frames are
		// ever read from it) purely to surface the OS permission prompt
		// early; the real, kept-open stream used for tracking is still only
		// opened/closed by startCamera/stopCamera, matching this widget's
		// "camera only runs while actually tracking" design.
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
			clearTimeout(this.trueTimer);
			clearTimeout(this.falseTimer);
			this.stopCamera();
			if(this.faceLandmarker) {
				this.faceLandmarker.close();
			}
		},

		onModelChange: function(model) {
			var changed = model.changedAttributes();

			if(changed.simulate !== undefined) {
				if(this.model.get('simulate')) {
					// Simulate bypasses the camera/threshold gate entirely,
					// same spirit as Knob's dial always driving its output
					// regardless of anything else.
					clearTimeout(this.trueTimer);
					clearTimeout(this.falseTimer);
					this.waitLastTrueState = false;
					this.waitLastFalseState = false;
					this.stopCamera();
					this.model.set({trackingState: 'off', tracking: false});
					this.applySimulatedOutputs();
				}
				else {
					// Turning simulate back off doesn't mean `in` just
					// crossed the threshold - it may already have been
					// sitting above it the whole time simulate was masking
					// the gate. Re-check now instead of waiting for the
					// next actual change to `in`/`threshold` (which might
					// never come if nothing re-wires this widget).
					this.evaluateTrackingGate();
				}
				return;
			}

			if(this.model.get('simulate')) {
				if(changed.simX !== undefined || changed.simY !== undefined ||
					changed.simSmile !== undefined || changed.simFaceDetected !== undefined) {
					this.applySimulatedOutputs();
				}
				return;
			}

			if(changed.in !== undefined || changed.threshold !== undefined) {
				this.evaluateTrackingGate();
			}
		},

		applySimulatedOutputs: function() {
			this.model.set({
				faceDetected: this.model.get('simFaceDetected') ? RANGE_MAX : 0,
				x: parseInt(this.model.get('simX'), 10),
				y: parseInt(this.model.get('simY'), 10),
				smile: parseInt(this.model.get('simSmile'), 10),
			});
		},

		// Threshold-gated start/stop for `tracking`, mirroring IfThen.js's
		// ifTest rising/falling-edge + waitTimeTrue/waitTimeFalse logic (per
		// the user's own request to reuse that exact pattern) rather than
		// inventing a new one. Simplified relative to IfThen's version: this
		// only re-evaluates when `in`/`threshold` actually change (see
		// onModelChange above), not on every unrelated model change, so it
		// doesn't need IfThen's extra re-entrant "recompute elapsed time on
		// every call" handling - a plain setTimeout per pending transition is
		// sufficient here.
		evaluateTrackingGate: function() {
			var self = this;
			var input = parseFloat(this.model.get('in'));
			var threshold = parseFloat(this.model.get('threshold'));
			var waitTimeTrue = parseInt(this.model.get('waitTimeTrue'), 10);
			var waitTimeFalse = parseInt(this.model.get('waitTimeFalse'), 10);

			if(input >= threshold) {
				this.waitLastFalseState = false;
				clearTimeout(this.falseTimer);

				if(this.model.get('tracking')) {
					// Already on (possibly mid-wait to stop) - a renewed rise
					// cancels any pending stop and just keeps tracking, same
					// as IfThen's ifState === 'falseWaiting' short-circuit.
					this.model.set('trackingState', 'on');
					return;
				}

				if(waitTimeTrue === 0) {
					this.startTracking();
				}
				else if(!this.waitLastTrueState) {
					this.waitLastTrueState = true;
					this.model.set('trackingState', 'startWaiting');
					clearTimeout(this.trueTimer);
					this.trueTimer = setTimeout(function() {
						if(self.waitLastTrueState) {
							self.startTracking();
						}
					}, waitTimeTrue);
				}
			}
			else {
				this.waitLastTrueState = false;
				clearTimeout(this.trueTimer);

				if(!this.model.get('tracking')) {
					this.model.set('trackingState', 'off');
					return;
				}

				if(waitTimeFalse === 0) {
					this.stopTracking();
				}
				else if(!this.waitLastFalseState) {
					// This is the latch: a drop below threshold doesn't stop
					// tracking immediately, it starts this timer instead, and
					// only actually stops if `in` is *still* below threshold
					// when it fires (the rising-edge branch above cancels it
					// otherwise). waitTimeFalse: 0 above = no latch at all.
					this.waitLastFalseState = true;
					this.model.set('trackingState', 'stopWaiting');
					clearTimeout(this.falseTimer);
					this.falseTimer = setTimeout(function() {
						if(self.waitLastFalseState) {
							self.stopTracking();
						}
					}, waitTimeFalse);
				}
			}
		},

		startTracking: function() {
			clearTimeout(this.trueTimer);
			this.waitLastTrueState = false;
			this.model.set({tracking: true, trackingState: 'on', statusMessage: ''});
			this.startCamera();

			// Flip the "more" panel open so the camera preview is visible
			// the moment tracking actually starts, rather than requiring
			// the user to notice/click "more" themselves - same
			// actively-inform-the-user spirit as the status dot.
			// WidgetMulti's own tab click handler just does a plain jQuery
			// .toggle() with no separate tracked state, so calling .show()
			// directly here is safe - it won't desync that handler.
			if(!app.server) {
				this.$('.widgetBottom .content').show();
			}
		},

		stopTracking: function() {
			clearTimeout(this.falseTimer);
			this.waitLastFalseState = false;
			this.model.set({
				tracking: false,
				trackingState: 'off',
				faceDetected: 0,
				x: 0,
				y: 0,
				smile: 0,
			});
			this.stopCamera();
		},

		// Lazily created once, reused across every start/stop cycle - only
		// the camera stream itself (see startCamera/stopCamera) opens/closes
		// with `tracking`, not this (loading the WASM runtime + model is the
		// expensive part).
		ensureFaceLandmarker: function() {
			if(this.faceLandmarker) {
				return Promise.resolve(this.faceLandmarker);
			}
			if(this.loadingLandmarker) {
				return this.loadingLandmarker;
			}

			var self = this;
			this.loadingLandmarker = import(/* webpackIgnore: true */ VISION_BUNDLE_PATH)
				.then(function(vision) {
					return vision.FilesetResolver.forVisionTasks(WASM_BASE_PATH).then(function(filesetResolver) {
						return vision.FaceLandmarker.createFromOptions(filesetResolver, {
							baseOptions: {
								modelAssetPath: MODEL_PATH,
								delegate: 'GPU',
							},
							runningMode: 'VIDEO',
							numFaces: 1,
							outputFaceBlendshapes: true,
							outputFacialTransformationMatrixes: false,
						});
					});
				})
				.then(function(landmarker) {
					self.faceLandmarker = landmarker;
					self.loadingLandmarker = null;
					return landmarker;
				})
				.catch(function(err) {
					self.loadingLandmarker = null;
					self.model.set('statusMessage', 'Face tracking failed to load: ' + err.message);
					throw err;
				});

			return this.loadingLandmarker;
		},

		// Privacy/CPU: the camera stream itself opens/closes with `tracking`,
		// it doesn't stay open for the widget's whole lifetime - same
		// bounded-active-time spirit as SpeechIn's listenStart/listenStop only
		// holding the mic open between calls.
		startCamera: function() {
			if(this.model.get('simulate')) {
				return;
			}

			var self = this;
			navigator.mediaDevices.getUserMedia({video: {width: 320, height: 240}, audio: false})
				.then(function(stream) {
					self.mediaStream = stream;
					if(self.videoEl) {
						self.videoEl.srcObject = stream;
						self.videoEl.play();
					}
					return self.ensureFaceLandmarker();
				})
				.catch(function(err) {
					self.model.set({
						statusMessage: 'Camera error: ' + err.message,
						tracking: false,
						trackingState: 'off',
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
			if(!this.model.get('active') || !this.model.get('tracking') || this.model.get('simulate')) {
				return;
			}
			if(!this.faceLandmarker || !this.videoEl || this.videoEl.readyState < 2) {
				return;
			}

			var now = performance.now();
			if(now - this.lastDetectMs < DETECT_INTERVAL_MS) {
				return;
			}
			this.lastDetectMs = now;

			// Timing.js's tick() calls every registered widget's frame
			// callback in a single loop with no try/catch - an uncaught
			// throw here wouldn't just break FaceTrack, it would kill the
			// requestAnimationFrame chain for every widget in the patch
			// (nothing re-schedules the next tick). Never let detectForVideo
			// take the whole app's timing loop down with it.
			try {
				var result = this.faceLandmarker.detectForVideo(this.videoEl, now);
				this.applyDetectionResult(result);
			}
			catch(err) {
				this.model.set('statusMessage', 'Detection error: ' + err.message);
			}
		},

		applyDetectionResult: function(result) {
			var landmarks = result.faceLandmarks && result.faceLandmarks[0];

			if(!landmarks || landmarks.length === 0) {
				this.model.set({faceDetected: 0, x: 0, y: 0, smile: 0});
				this.drawOverlay(null);
				return;
			}

			var sumX = 0, sumY = 0;
			for(var i = 0; i < landmarks.length; i++) {
				sumX += landmarks[i].x;
				sumY += landmarks[i].y;
			}
			var centerX = sumX / landmarks.length;
			var centerY = sumY / landmarks.length;

			var smileLeft = 0, smileRight = 0;
			var categories = result.faceBlendshapes && result.faceBlendshapes[0] && result.faceBlendshapes[0].categories;
			if(categories) {
				for(var b = 0; b < categories.length; b++) {
					var name = categories[b].categoryName;
					if(name === 'mouthSmileLeft') {
						smileLeft = categories[b].score;
					}
					else if(name === 'mouthSmileRight') {
						smileRight = categories[b].score;
					}
				}
			}

			this.model.set({
				faceDetected: RANGE_MAX,
				x: Math.round(centerX * RANGE_MAX),
				y: Math.round(centerY * RANGE_MAX),
				smile: Math.round(((smileLeft + smileRight) / 2) * RANGE_MAX),
			});

			this.drawOverlay(landmarks);
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

	});
});
