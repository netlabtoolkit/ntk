define([
	'backbone',
	'rivets',
	'views/item/WidgetMulti',
	'text!./template.js',
	'utils/SceneScript',
],
function(Backbone, rivets, WidgetView, Template, SceneScript){
	'use strict';

	// A new Scene starts with this, to edit rather than start from blank.
	var STARTER_SCRIPT = [
		'# A road crossing: wire a Servo to gate,',
		'# LEDs to left and right, a sensor to in1.',
		'outs gate, left, right, running',
		'',
		'cue gates down',
		'  0s  blink left/right every 0.5s',
		'  2s  gate to 90 in 3s',
		'',
		'cue gates up when in1 low max 60s',
		'  2s  gate to 0 in 3s',
		'  5s  left = 0',
		'  5s  right = 0',
		'',
		'idle:',
		'  gate to 0 in 3s',
		'  left = 0',
		'  right = 0',
	].join('\n');

	var OUT_FIELDS = ['out1', 'out2', 'out3', 'out4'];

	function toNumber(value, fallback) {
		var n = parseFloat(value);
		return isNaN(n) ? fallback : n;
	}

	// An outlet's value as shown beside its nub: short numbers, short text.
	function shortValue(value) {
		if(typeof value === 'number') {
			var rounded = Math.round(value * 10) / 10;
			return String(Math.abs(rounded) >= 100 ? Math.round(value) : rounded);
		}
		value = String(value);
		return value.length > 5 ? value.slice(0, 4) + '…' : value;
	}

	function formatSeconds(ms) {
		return (Math.max(0, ms) / 1000).toFixed(1) + 's';
	}

	return WidgetView.extend({
		widgetEvents: {
			'click .scenePlay': 'togglePlay',
			'click .sceneStatus': 'statusClicked',
			// Errors are listed as the script is typed; the script itself
			// only takes effect on leaving the box (rv-value's 'change').
			'input .sceneScript': 'checkScript',
		},
		ins: [
			// Plays from the first cue on rising above the threshold.
			{title: 'start', to: 'start'},
			{title: 'stop', to: 'stop'},
			// Read only by "cue ... when in1 high/low".
			{title: 'in1', to: 'in1'},
			{title: 'in2', to: 'in2'},
		],
		outs: [
			{title: 'out1', from: 'out1', to: 'out1'},
			{title: 'out2', from: 'out2', to: 'out2'},
			{title: 'out3', from: 'out3', to: 'out3'},
			{title: 'out4', from: 'out4', to: 'out4'},
		],
		typeID: 'Scene',
		className: 'scene',
		categories: ['generator'],
		template: _.template(Template),

		initialize: function(options) {
			WidgetView.prototype.initialize.call(this, options);

			// Read by onModelChange, which the set() below fires - must
			// exist first (see CLAUDE.md's Rivets/Backbone gotchas).
			this.scene = null;
			this.runner = null;
			this.lastStart = NaN;
			this.lastStop = NaN;

			this.model.set({
				title: 'Scene',
				script: this.model.get('script') === undefined ? STARTER_SCRIPT : this.model.get('script'),
				threshold: this.model.get('threshold') === undefined ? 512 : this.model.get('threshold'),
				restartOnStart: !!this.model.get('restartOnStart'),
				// Inlets. Unwired, in1/in2 aren't high or low, so a "when"
				// cue waits - click its status to start it by hand.
				start: '--',
				stop: '--',
				in1: '--',
				in2: '--',
				out1: 0, out2: 0, out3: 0, out4: 0,
				// Display only, rebuilt on every frame.
				sceneCue: '',
				sceneStatus: '',
				sceneStatusTitle: '',
				sceneProgress: 0,
				scenePlaying: false,
				sceneWaiting: false,
				sceneHasError: false,
				sceneErrors: [],
				v1: '0', v2: '0', v3: '0', v4: '0',
				n1: 'out1', n2: 'out2', n3: 'out3', n4: 'out4',
			});

			this.loadScript();

			this.localTimeKeeperFunc = function(frameCount) {
				this.timeKeeper(frameCount);
			}.bind(this);
			window.app.timingController.registerFrameCallback(this.localTimeKeeperFunc, this);
		},

		onRender: function() {
			// Must be registered before WidgetView.prototype.onRender -
			// see CLAUDE.md's Rivets/Backbone gotcha.
			rivets.binders.sceneprogress = function(el, value) {
				el.style.width = Math.max(0, Math.min(100, toNumber(value, 0))) + '%';
			};

			WidgetView.prototype.onRender.call(this);
			this.nameOutlets();
		},

		// The script's outlet names ("gate (out1)") as the nubs' tooltips.
		// Set on the elements directly: the outs list itself must stay
		// as it is, since the cables hang on its rendered nubs.
		nameOutlets: function() {
			var nubs = this.$('.widgetRight .outlet');
			for(var i = 0; i < nubs.length && i < 4; i++) {
				nubs.eq(i).attr('title', this.model.get('n' + (i + 1)));
			}
		},

		/**
		 * loadScript - parse the script and, if it reads, start a fresh
		 * runner with the idle lines applied at once, so outlets start
		 * where the scene expects them. A script with errors stops the
		 * scene where it is (outlets keep their values) and can't play.
		 *
		 * @return {void}
		 */
		loadScript: function() {
			var scene = SceneScript.parse(this.model.get('script'));
			this.showErrors(scene);
			if(!scene.ok) {
				this.scene = scene;
				this.runner = null;
				this.updateDisplay(Date.now());
				return;
			}
			this.scene = scene;
			this.runner = SceneScript.createRunner(scene);
			this.runner.applyIdle(Date.now());

			var names = {};
			for(var i = 0; i < 4; i++) {
				names['n' + (i + 1)] = scene.outs[i] ? scene.outs[i] + ' (out' + (i + 1) + ')' : 'out' + (i + 1);
			}
			this.model.set(names);
			this.nameOutlets();
			this.pushOutputs();
			this.updateDisplay(Date.now());
		},

		showErrors: function(scene) {
			this.model.set({
				sceneErrors: scene.errors.map(function(e) { return 'line ' + e.line + ': ' + e.message; }),
				sceneHasError: !scene.ok,
			});
		},

		checkScript: function(e) {
			this.showErrors(SceneScript.parse(e.target.value));
		},

		isMonitored: function() {
			var monitoring = window.app.monitoring;
			return !!(monitoring && monitoring.active && monitoring.wids && monitoring.wids[this.model.get('wid')]);
		},

		inlets: function() {
			return {in1: this.model.get('in1'), in2: this.model.get('in2'), threshold: toNumber(this.model.get('threshold'), 512)};
		},

		timeKeeper: function() {
			if(!this.runner || this.isMonitored()) { return; }
			var now = Date.now();
			this.runner.tick(now, this.inlets());
			this.pushOutputs();
			this.updateDisplay(now);
		},

		// Outlets only change when their value does, so a cable isn't
		// sent the same value every frame.
		pushOutputs: function() {
			var changes = {};
			for(var i = 0; i < 4; i++) {
				var value = this.runner.outputs[i];
				if(value !== this.model.get(OUT_FIELDS[i])) {
					changes[OUT_FIELDS[i]] = value;
					changes['v' + (i + 1)] = shortValue(value);
				}
			}
			if(!_.isEmpty(changes)) { this.model.set(changes); }
		},

		updateDisplay: function(now) {
			var d = {sceneCue: '', sceneStatus: '', sceneStatusTitle: '', sceneProgress: 0,
				scenePlaying: false, sceneWaiting: false};

			if(this.scene && !this.scene.ok) {
				d.sceneStatus = 'script error';
				d.sceneStatusTitle = 'line ' + this.scene.errors[0].line + ': ' + this.scene.errors[0].message;
			}
			else if(this.runner) {
				var s = this.runner.status(now);
				d.sceneCue = s.cue;
				d.sceneProgress = Math.round(s.progress * 100);
				d.scenePlaying = s.phase === 'waiting' || s.phase === 'playing';
				if(s.phase === 'waiting') {
					d.sceneWaiting = true;
					d.sceneStatus = 'wait ' + s.waitingFor;
					d.sceneStatusTitle = 'Waiting to start this cue - click to start it now';
				}
				else if(s.phase === 'playing') {
					var cue = this.scene.cues[this.runner.cueIndex];
					d.sceneStatus = formatSeconds(s.progress * cue.length) + ' / ' + formatSeconds(cue.length);
				}
				else if(s.phase === 'stopping') {
					d.sceneStatus = 'to idle';
				}
				else {
					d.sceneStatus = s.phase;
				}
			}

			var changed = {};
			_.each(d, function(value, key) {
				if(this.model.get(key) !== value) { changed[key] = value; }
			}, this);
			if(!_.isEmpty(changed)) { this.model.set(changed); }
		},

		play: function() {
			if(!this.runner || !this.scene.ok) { return; }
			this.runner.play(Date.now());
			this.runner.tick(Date.now(), this.inlets());
			this.pushOutputs();
		},

		stop: function() {
			if(!this.runner) { return; }
			this.runner.stop(Date.now());
			this.pushOutputs();
		},

		togglePlay: function(e) {
			e.preventDefault();
			e.stopPropagation();
			if(this.model.get('scenePlaying')) { this.stop(); }
			else { this.play(); }
		},

		// Starting a waiting cue by hand stands in for its sensor, so a
		// scene can be tried with nothing wired into in1/in2.
		statusClicked: function(e) {
			if(!this.runner || this.runner.phase !== 'waiting') { return; }
			e.preventDefault();
			e.stopPropagation();
			this.runner.skipWait(Date.now());
			this.pushOutputs();
		},

		onModelChange: function(model, options) {
			var changed = model.changedAttributes();
			if(!changed) { return; }

			if(changed.script !== undefined) {
				this.loadScript();
			}

			// start/stop only mean something when they arrive through a
			// cable (WidgetMulti.syncWithSource marks those with
			// updateNoTrigger) - not when a patch loads them.
			if(!(options && options.updateNoTrigger) || this.isMonitored()) { return; }
			var threshold = toNumber(this.model.get('threshold'), 512);

			if(changed.start !== undefined) {
				var start = toNumber(changed.start, NaN);
				if(start >= threshold && !(this.lastStart >= threshold)) {
					var busy = this.runner && (this.runner.phase === 'waiting' || this.runner.phase === 'playing');
					if(!busy || this.model.get('restartOnStart')) { this.play(); }
				}
				this.lastStart = start;
			}

			if(changed.stop !== undefined) {
				var stop = toNumber(changed.stop, NaN);
				if(stop >= threshold && !(this.lastStop >= threshold)) { this.stop(); }
				this.lastStop = stop;
			}
		},

		onRemove: function() {
			window.app.timingController.removeFrameCallback(this.localTimeKeeperFunc, this);
		},
	});
});
