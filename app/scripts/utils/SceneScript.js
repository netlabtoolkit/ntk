(function(factory) {
	// Loads in the app (RequireJS) and in Node, for test/scene-test.js.
	if(typeof define === 'function' && define.amd) { define([], factory); }
	else { module.exports = factory(); }
})(function() {
	'use strict';

	/**
	 * The Scene widget's script: parse() reads the text into cues and
	 * lines, createRunner() plays them. No DOM, no clock of its own - the
	 * caller passes the time (ms) in - so the same scenes run under the
	 * tests in test/scene-cases.json, and the board's interpreter can be
	 * checked against the same cases. Format and behaviour:
	 * plans/scene-widget.md. Error messages are part of the format: the
	 * board must word them the same.
	 */

	var MAX_OUTS = 4;
	var RESERVED = ['cue', 'idle', 'repeat', 'blink', 'outs', 'in1', 'in2', 'when', 'after', 'to', 'in', 'every', 'between', 'and', 'for', 'ease', 'from', 'max', 'then', 'loop', 'until', 'times', 'wait'];
	// More cue changes than this in one tick means cues with no time in
	// them going round and round - stop for this tick, carry on next.
	var MAX_CUE_CHANGES_PER_TICK = 100;

	// ---- easings: same formulas as the interpreter's _EASINGS ----

	function bounceOut(t) {
		if(t < 4 / 11) { return 121 * t * t / 16; }
		if(t < 8 / 11) { return (363 / 40 * t * t) - (99 / 10 * t) + 17 / 5; }
		if(t < 9 / 10) { return (4356 / 361 * t * t) - (35442 / 1805 * t) + 16061 / 1805; }
		return (54 / 5 * t * t) - (513 / 25 * t) + 268 / 25;
	}
	function backIn(t) { return t * t * t - t * Math.sin(t * Math.PI); }
	var PI = Math.PI;
	var EASINGS = {
		quad: [function(t) { return t * t; },
			function(t) { return -(t * (t - 2)); },
			function(t) { return t < 0.5 ? 2 * t * t : (-2 * t * t) + (4 * t) - 1; }],
		cubic: [function(t) { return t * t * t; },
			function(t) { return Math.pow(t - 1, 3) + 1; },
			function(t) { if(t < 0.5) { return 4 * t * t * t; } var p = 2 * t - 2; return 0.5 * p * p * p + 1; }],
		quart: [function(t) { return Math.pow(t, 4); },
			function(t) { return Math.pow(t - 1, 3) * (1 - t) + 1; },
			function(t) { if(t < 0.5) { return 8 * Math.pow(t, 4); } var p = t - 1; return -8 * Math.pow(p, 4) + 1; }],
		quint: [function(t) { return Math.pow(t, 5); },
			function(t) { return Math.pow(t - 1, 5) + 1; },
			function(t) { if(t < 0.5) { return 16 * Math.pow(t, 5); } var p = (2 * t) - 2; return 0.5 * Math.pow(p, 5) + 1; }],
		sine: [function(t) { return Math.sin((t - 1) * PI / 2) + 1; },
			function(t) { return Math.sin(t * PI / 2); },
			function(t) { return 0.5 * (1 - Math.cos(t * PI)); }],
		circ: [function(t) { return 1 - Math.sqrt(1 - (t * t)); },
			function(t) { return Math.sqrt((2 - t) * t); },
			function(t) { return t < 0.5 ? 0.5 * (1 - Math.sqrt(1 - 4 * (t * t))) : 0.5 * (Math.sqrt(-((2 * t) - 3) * ((2 * t) - 1)) + 1); }],
		expo: [function(t) { return t === 0 ? 0 : Math.pow(2, 10 * (t - 1)); },
			function(t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); },
			function(t) { if(t === 0 || t === 1) { return t; } return t < 0.5 ? 0.5 * Math.pow(2, (20 * t) - 10) : -0.5 * Math.pow(2, (-20 * t) + 10) + 1; }],
		elastic: [function(t) { return Math.sin(13 * PI / 2 * t) * Math.pow(2, 10 * (t - 1)); },
			function(t) { return Math.sin(-13 * PI / 2 * (t + 1)) * Math.pow(2, -10 * t) + 1; },
			function(t) { return t < 0.5 ? 0.5 * Math.sin(13 * PI / 2 * (2 * t)) * Math.pow(2, 10 * ((2 * t) - 1)) : 0.5 * (Math.sin(-13 * PI / 2 * ((2 * t - 1) + 1)) * Math.pow(2, -10 * (2 * t - 1)) + 2); }],
		back: [backIn,
			function(t) { return 1 - backIn(1 - t); },
			function(t) { return t < 0.5 ? 0.5 * backIn(2 * t) : 0.5 * (1 - backIn(1 - (2 * t - 1))) + 0.5; }],
		bounce: [function(t) { return 1 - bounceOut(1 - t); },
			bounceOut,
			function(t) { return t < 0.5 ? 0.5 * (1 - bounceOut(1 - t * 2)) : 0.5 * bounceOut(t * 2 - 1) + 0.5; }],
	};
	var EASE_SIDES = {'in': 0, 'out': 1, 'in-out': 2};

	function ease(spec, t) {
		if(!spec) { return t; }
		return EASINGS[spec.curve][spec.side](t);
	}

	// ---- parsing ----

	function ParseError(message) { this.message = message; }

	// "2s" -> 2000, "500ms" -> 500. A bare number is an error, not a guess.
	function parseTime(word) {
		var m = /^(\d+(?:\.\d+)?|\.\d+)(ms|s)$/.exec(word || '');
		if(m) { return m[2] === 's' ? Math.round(parseFloat(m[1]) * 1000) : Math.round(parseFloat(m[1])); }
		if(/^-?\d+(\.\d+)?$/.test(word || '')) { throw new ParseError('add "s" or "ms" to ' + word); }
		throw new ParseError('"' + (word || '') + '" isn\'t a time - write it like 2s or 500ms');
	}

	// "2s..6s" -> [2000, 6000]; "3s" -> [3000, 3000].
	function parseTimeRange(word) {
		var parts = String(word).split('..');
		if(parts.length > 2) { throw new ParseError('"' + word + '" isn\'t a time - write it like 2s or 2s..6s'); }
		var lo = parseTime(parts[0]);
		var hi = parts.length === 2 ? parseTime(parts[1]) : lo;
		if(hi < lo) { throw new ParseError('the shorter time goes first: ' + parts[1] + '..' + parts[0]); }
		return [lo, hi];
	}

	function parseNumber(word) {
		if(!/^-?(\d+(\.\d+)?|\.\d+)$/.test(word || '')) {
			throw new ParseError('"' + (word || '') + '" isn\'t a number');
		}
		return parseFloat(word);
	}

	// Splits a line into words, keeping "quoted text" as one word.
	function tokenize(text) {
		var words = [], re = /"([^"]*)"|(\S+)/g, m;
		while((m = re.exec(text)) !== null) {
			words.push(m[1] !== undefined ? {text: m[1], quoted: true} : {text: m[2], quoted: false});
		}
		return words;
	}

	// Drops a # comment - not one inside "quotes".
	function stripComment(line) {
		var inQuote = false;
		for(var i = 0; i < line.length; i++) {
			if(line[i] === '"') { inQuote = !inQuote; }
			else if(line[i] === '#' && !inQuote) { return line.slice(0, i); }
		}
		return line;
	}

	function outletIndex(scene, word) {
		var name = String(word).toLowerCase();
		var m = /^out([1-4])$/.exec(name);
		if(m) { return parseInt(m[1], 10) - 1; }
		var index = scene.outs.indexOf(name);
		if(index !== -1) { return index; }
		var named = scene.outs.filter(function(n) { return n; });
		throw new ParseError('no outlet called "' + word + '"' + (named.length ? ' (outlets: ' + named.join(', ') + ')' : ''));
	}

	function writableOutlet(scene, word) {
		var index = outletIndex(scene, word);
		if(index === scene.runningOut) {
			throw new ParseError('"running" is set by the scene itself - it can\'t be changed');
		}
		return index;
	}

	// "[TIME] ACTION" -> {at, kind, ...}
	function parseAction(scene, words, timed) {
		var at = 0, hasTime = false;
		if(timed && words.length && /^[\d.]/.test(words[0].text) && !words[0].quoted) {
			at = parseTime(words[0].text);
			hasTime = true;
			words = words.slice(1);
		}
		if(!words.length) { throw new ParseError('a time needs something to do after it'); }
		var w = function(i) { return words[i] ? words[i].text : undefined; };
		var lw = function(i) { return words[i] ? words[i].text.toLowerCase() : undefined; };

		// "wait 1s": does nothing for that long - a pause a "then" line
		// can follow, or rest at the end of a cue (between a loop's
		// rounds, say).
		if(lw(0) === 'wait') {
			if(words.length < 2) { throw new ParseError('wait how long? e.g. wait 1s'); }
			if(words.length > 2) { throw new ParseError('didn\'t expect "' + w(2) + '" after the wait'); }
			return {at: at, kind: 'wait', duration: parseTime(w(1)), hasTime: hasTime, written: w(1)};
		}

		if(lw(0) === 'blink') {
			if(words.length < 2) { throw new ParseError('blink what? e.g. blink lamp every 0.5s'); }
			var targets = w(1).split('/');
			if(targets.length > 2) { throw new ParseError('blink alternates at most two outlets, like left/right'); }
			var action = {at: at, kind: 'blink', outs: targets.map(function(t) { return writableOutlet(scene, t); }),
				every: null, lo: 0, hi: 1, duration: null};
			var i = 2;
			while(i < words.length) {
				if(lw(i) === 'every') { action.every = parseTime(w(i + 1)); i += 2; }
				else if(lw(i) === 'for') { action.duration = parseTime(w(i + 1)); i += 2; }
				else if(lw(i) === 'between') {
					if(lw(i + 2) !== 'and') { throw new ParseError('write it like: between 0 and 255'); }
					action.lo = parseNumber(w(i + 1));
					action.hi = parseNumber(w(i + 3));
					i += 4;
				}
				else { throw new ParseError('didn\'t expect "' + w(i) + '" in a blink'); }
			}
			if(action.every === null) { throw new ParseError('blink needs "every" and a time, e.g. every 0.5s'); }
			if(action.every <= 0) { throw new ParseError('blink "every" must be longer than 0s'); }
			return action;
		}

		if(w(1) === '=') {
			if(words.length !== 3) { throw new ParseError('write a set like: lamp = 1'); }
			var out = writableOutlet(scene, w(0));
			return {at: at, kind: 'set', out: out, value: words[2].quoted ? words[2].text : parseNumber(w(2))};
		}

		if(lw(1) === 'to') {
			var ramp = {at: at, kind: 'ramp', out: writableOutlet(scene, w(0)), ease: null};
			if(words[2] && words[2].quoted) { throw new ParseError('text can\'t ramp - use = to set it'); }
			ramp.to = parseNumber(w(2));
			if(lw(3) !== 'in') { throw new ParseError('a ramp needs "in" and a time, e.g. gate to 90 in 3s'); }
			ramp.duration = parseTime(w(4));
			if(words.length > 5) {
				if(lw(5) !== 'ease') { throw new ParseError('didn\'t expect "' + w(5) + '" after the ramp'); }
				var side = 'in-out', curve = lw(6);
				if(EASE_SIDES[curve] !== undefined) { side = curve; curve = lw(7); }
				if(!EASINGS[curve]) {
					throw new ParseError('no easing called "' + (curve || '') + '" (easings: ' + Object.keys(EASINGS).join(', ') + ')');
				}
				var used = side === 'in-out' && lw(6) !== 'in-out' ? 7 : 8;
				if(words.length > used) { throw new ParseError('didn\'t expect "' + w(used) + '" after the easing'); }
				ramp.ease = {side: EASE_SIDES[side], curve: curve};
			}
			return ramp;
		}

		throw new ParseError('can\'t read "' + words.map(function(x) { return x.text; }).join(' ') + '"');
	}

	// "loop" / "loop 3 times" / "loop until in1 high" -> {type, ...}
	function parseLoop(rest) {
		if(!rest.length) { return {type: 'forever'}; }
		if(rest[0] === 'until') {
			if(rest[1] !== 'in1' && rest[1] !== 'in2') { throw new ParseError('"loop until" needs in1 or in2, e.g. loop until in1 high'); }
			if(rest[2] !== 'high' && rest[2] !== 'low') { throw new ParseError('"loop until ' + rest[1] + '" needs high or low after it'); }
			if(rest.length > 3) { throw new ParseError('didn\'t expect "' + rest[3] + '" after "loop until ' + rest[1] + ' ' + rest[2] + '"'); }
			return {type: 'until', inlet: rest[1], level: rest[2]};
		}
		if(rest.length === 2 && (rest[1] === 'times' || rest[1] === 'time')) {
			if(!/^\d+$/.test(rest[0]) || parseInt(rest[0], 10) < 1) { throw new ParseError('"' + rest[0] + '" isn\'t a number of times - write it like: loop 3 times'); }
			return {type: 'times', count: parseInt(rest[0], 10)};
		}
		throw new ParseError('write it like: loop, loop 3 times, or loop until in1 high');
	}

	// "cue gates up when in1 low max 60s loop 3 times" -> {name, trigger, loop}
	function parseCue(words, index) {
		var i = 1, nameWords = [];
		while(i < words.length && ['when', 'after', 'loop'].indexOf(words[i].text.toLowerCase()) === -1) {
			nameWords.push(words[i].text);
			i++;
		}
		var cue = {name: nameWords.join(' ').toLowerCase(), label: nameWords.join(' ') || 'cue ' + (index + 1),
			trigger: {type: 'next'}, loop: null, lines: [], length: 0};
		var lower = words.map(function(x) { return x.text.toLowerCase(); });
		var loopAt = lower.indexOf('loop', i);
		if(loopAt !== -1) {
			cue.loop = parseLoop(lower.slice(loopAt + 1));
			words = words.slice(0, loopAt);
		}
		if(i >= words.length) { return cue; }
		var kind = words[i].text.toLowerCase(), rest = words.slice(i + 1).map(function(x) { return x.text.toLowerCase(); });
		if(kind === 'after') {
			if(rest.length !== 1) { throw new ParseError('write it like: cue NAME after 2s (or after 2s..6s)'); }
			var range = parseTimeRange(rest[0]);
			cue.trigger = {type: 'after', min: range[0], max: range[1]};
			return cue;
		}
		// when
		if(rest[0] !== 'in1' && rest[0] !== 'in2') { throw new ParseError('"when" needs in1 or in2, e.g. when in1 high'); }
		// high / low: a level, true at once if it already is. rises /
		// falls: a change seen while the cue waits - a button press, or
		// another widget's done pulse.
		if(['high', 'low', 'rises', 'falls'].indexOf(rest[1]) === -1) { throw new ParseError('"when ' + rest[0] + '" needs high, low, rises or falls after it'); }
		cue.trigger = {type: 'when', inlet: rest[0], level: rest[1], max: null};
		if(rest.length > 2) {
			if(rest[2] !== 'max' || rest.length !== 4) { throw new ParseError('after "when ' + rest[0] + ' ' + rest[1] + '" only "max" and a time can follow'); }
			cue.trigger.max = parseTime(rest[3]);
		}
		return cue;
	}

	function lineLength(line) {
		if(line.kind === 'ramp' || line.kind === 'wait') { return line.at + line.duration; }
		if(line.kind === 'blink' && line.duration !== null) { return line.at + line.duration; }
		return line.at;
	}

	function lineOuts(line) {
		if(line.kind === 'wait') { return []; }
		return line.kind === 'blink' ? line.outs : [line.out];
	}

	// Two lines on one outlet at the same time, the first a ramp or a
	// blink: the second replaces it at once, so the first never shows -
	// almost always meant to come after it. Lines in written order.
	function checkOverlaps(scene, lines) {
		lines.forEach(function(line, i) {
			for(var j = 0; j < i; j++) {
				var before = lines[j];
				if(before.at !== line.at) { continue; }
				if(!(before.kind === 'blink' || (before.kind === 'ramp' && before.duration > 0))) { continue; }
				var shared = lineOuts(line).filter(function(o) { return lineOuts(before).indexOf(o) !== -1; });
				if(!shared.length) { continue; }
				var name = scene.outs[shared[0]] || 'out' + (shared[0] + 1);
				scene.errors.push({line: line.line, message: '"' + name + '" already has a move at ' + (line.at / 1000) +
					's (line ' + before.line + ') - this replaces it at once; use "then" to start it after'});
				return;
			}
		});
	}

	// How long a set (or a ramp "in 0s") stays highlighted after it
	// happens - display only, see activeLines.
	var SET_SHOW_MS = 300;

	// Script line numbers of the lines doing something `elapsed` ms
	// into a cue (or the idle lines): a ramp, wait or blink while it
	// runs, a set just after it happens - not a move a later line on
	// the same outlet has already replaced. For the widget's highlight.
	// left (optional): filled with line -> fraction of its time still to
	// go (1 -> 0), for lines with a time of their own (a ramp, a wait,
	// a blink with "for"); the widget draws it as a shrinking bar.
	function activeLines(lines, elapsed, left) {
		var active = [];
		lines.forEach(function(l) {
			if(elapsed < l.at) { return; }
			var end;
			if(l.kind === 'set' || (l.kind !== 'blink' && l.duration === 0)) { end = l.at + SET_SHOW_MS; }
			else if(l.kind === 'blink') { end = l.duration === null ? Infinity : l.at + l.duration; }
			else { end = l.at + l.duration; }
			if(elapsed >= end) { return; }
			var outs = lineOuts(l);
			var replaced = outs.length && lines.some(function(o) {
				return o !== l && o.at > l.at && o.at <= elapsed &&
					lineOuts(o).some(function(x) { return outs.indexOf(x) !== -1; });
			});
			if(!replaced) {
				active.push(l.line);
				var timed = l.kind !== 'set' && l.duration !== null && l.duration > 0;
				if(left && timed) { left[l.line] = Math.max(0, Math.min(1, (end - elapsed) / l.duration)); }
			}
		});
		return active;
	}

	function sortLines(lines) {
		// Time order; same time keeps the order written.
		return lines.map(function(l, i) { return {l: l, i: i}; })
			.sort(function(a, b) { return a.l.at - b.l.at || a.i - b.i; })
			.map(function(x) { return x.l; });
	}

	/**
	 * parse - script text -> scene. Never throws: problems come back in
	 * `errors` ({line, message}, line counted from 1), and a scene with
	 * errors has ok: false and must not be played.
	 */
	function parse(text) {
		var scene = {ok: true, errors: [], outs: [null, null, null, null], runningOut: -1,
			cues: [], repeat: null, idle: [], hasIdle: false};
		var section = 'top', repeatName = null, repeatLine = 0;
		var lines = String(text || '').split(/\r\n|\r|\n/);

		lines.forEach(function(raw, n) {
			var lineNo = n + 1;
			var words = tokenize(stripComment(raw).trim());
			if(!words.length) { return; }
			var first = words[0].text.toLowerCase();
			try {
				if(first === 'outs') {
					if(section !== 'top') { throw new ParseError('"outs" goes at the top, before the first cue'); }
					var names = words.slice(1).map(function(x) { return x.text; }).join(' ').split(',')
						.map(function(s) { return s.trim().toLowerCase(); });
					if(names.length > MAX_OUTS) { throw new ParseError('at most ' + MAX_OUTS + ' outlets'); }
					names.forEach(function(name, i) {
						if(!/^[a-z][a-z0-9_-]*$/.test(name)) { throw new ParseError('"' + name + '" can\'t be an outlet name - use one word, starting with a letter'); }
						if(RESERVED.indexOf(name) !== -1 || /^out[1-4]$/.test(name)) { throw new ParseError('"' + name + '" is a script word - pick another outlet name'); }
						if(names.indexOf(name) !== i) { throw new ParseError('"' + name + '" is used twice'); }
					});
					names.forEach(function(name, i) { scene.outs[i] = name; });
					scene.runningOut = names.indexOf('running');
					return;
				}
				if(first === 'cue') {
					if(section === 'idle') { throw new ParseError('cues go before "idle:"'); }
					if(section === 'repeat') { throw new ParseError('"repeat" must come after the last cue'); }
					var cue = parseCue(words, scene.cues.length);
					if(cue.name && scene.cues.some(function(c) { return c.name === cue.name; })) {
						throw new ParseError('there\'s already a cue called "' + cue.label + '"');
					}
					cue.line = lineNo;
					scene.cues.push(cue);
					section = 'cue';
					return;
				}
				if(first === 'repeat') {
					if(section === 'idle') { throw new ParseError('"repeat" goes before "idle:"'); }
					if(section === 'repeat') { throw new ParseError('only one "repeat"'); }
					if(!scene.cues.length) { throw new ParseError('"repeat" needs cues before it'); }
					if(words.length > 1) {
						if(words[1].text.toLowerCase() !== 'from' || words.length < 3) { throw new ParseError('write it like: repeat, or repeat from NAME'); }
						repeatName = words.slice(2).map(function(x) { return x.text; }).join(' ').toLowerCase();
					}
					repeatLine = lineNo;
					scene.repeat = 0;
					section = 'repeat';
					return;
				}
				if(first === 'idle:' || (first === 'idle' && words.length === 1)) {
					if(scene.hasIdle) { throw new ParseError('only one "idle:"'); }
					scene.hasIdle = true;
					section = 'idle';
					return;
				}
				if(section === 'top') { throw new ParseError('put this under a cue (a line starting with "cue")'); }
				if(section === 'repeat') { throw new ParseError('nothing can follow "repeat" except "idle:"'); }
				var target = section === 'idle' ? scene.idle : scene.cues[scene.cues.length - 1].lines;
				var action;
				if(first === 'then') {
					// Starts when the line written above it ends (plus
					// an optional gap): "then 0.5s lamp = 1". The first
					// line of a cue counts from the cue's start.
					if(words.length < 2) { throw new ParseError('then what? e.g. then lamp to 255 in 2s'); }
					action = parseAction(scene, words.slice(1), true);
					var prev = target[target.length - 1];
					if(prev) {
						if(prev.kind === 'blink' && prev.duration === null) {
							throw new ParseError('"then" can\'t follow a blink with no "for" - that blink never ends');
						}
						action.at += lineLength(prev);
					}
					action.then = true;
				}
				else {
					action = parseAction(scene, words, true);
					// A wait with no time of its own starts with the cue,
					// alongside the lines above it - written after them,
					// it's nearly always meant to come after them.
					if(action.kind === 'wait' && !action.hasTime && target.length) {
						throw new ParseError('this wait starts with the cue, not after the line above - write "then wait ' +
							action.written + '" (or give it a time, like "2s wait ' + action.written + '")');
					}
				}
				action.line = lineNo;
				target.push(action);
			}
			catch(e) {
				if(!(e instanceof ParseError)) { throw e; }
				scene.errors.push({line: lineNo, message: e.message});
			}
		});

		if(repeatName !== null) {
			var target = -1;
			scene.cues.forEach(function(c, i) { if(c.name === repeatName) { target = i; } });
			if(target === -1) { scene.errors.push({line: repeatLine, message: 'no cue called "' + repeatName + '"'}); }
			else { scene.repeat = target; }
		}

		scene.cues.forEach(function(cue) { checkOverlaps(scene, cue.lines); });
		checkOverlaps(scene, scene.idle);

		scene.cues.forEach(function(cue) {
			cue.lines = sortLines(cue.lines);
			cue.length = cue.lines.reduce(function(m, l) { return Math.max(m, lineLength(l)); }, 0);
		});
		scene.cues.forEach(function(cue) {
			if(cue.loop && cue.length === 0) {
				scene.errors.push({line: cue.line, message: 'this cue takes no time, so its loop would go round instantly - give a ramp a time (in 0.5s) or add a wait'});
			}
		});
		scene.idle = sortLines(scene.idle);
		scene.idleLength = scene.idle.reduce(function(m, l) { return Math.max(m, lineLength(l)); }, 0);

		// A repeat round with no time in it at all would never let go.
		if(scene.repeat !== null && scene.errors.length === 0) {
			var loop = scene.cues.slice(scene.repeat);
			var timeless = loop.every(function(c) {
				return c.length === 0 && (c.trigger.type === 'next' || (c.trigger.type === 'after' && c.trigger.max === 0));
			});
			if(timeless) { scene.errors.push({line: repeatLine, message: 'this repeat takes no time - give a cue a time, a wait or a "when"'}); }
		}
		if(!scene.cues.length && scene.errors.length === 0 && String(text || '').trim()) {
			scene.errors.push({line: 1, message: 'a scene needs at least one cue'});
		}

		scene.errors.sort(function(a, b) { return a.line - b.line; });
		scene.ok = scene.errors.length === 0;
		return scene;
	}

	// ---- running ----

	/**
	 * createRunner - plays a parsed scene. Time comes from the caller,
	 * in ms. Everything is worked out at the exact time it's due, not
	 * at the tick that notices it, so a scene comes out the same at any
	 * tick rate - only "when" (an inlet seen at a tick) depends on ticks.
	 *
	 * options.random: () -> [0, 1), for "after 2s..6s" (tests pass a
	 * fixed sequence).
	 */
	function createRunner(scene, options) {
		options = options || {};
		var random = options.random || Math.random;
		var r = {
			outputs: [0, 0, 0, 0],
			phase: 'idle',     // idle | waiting | playing | stopping | ended
			cueIndex: -1,
		};
		var ramps = {}, blinks = {};   // by outlet index
		var cueStart = 0, prevEnd = 0, waitUntil = null, fired = 0, current = null;
		var round = 1;   // which time through a looping cue
		// Whether in1/in2 were high at the last tick, for "when in1
		// rises/falls"; undefined until the first tick, so a value that's
		// already high then isn't a rise. Unwired counts as low.
		var wasHigh = {};

		function cancel(out) { delete ramps[out]; delete blinks[out]; }

		// Outputs as they are at time t, for every ramp and blink.
		function advanceTo(t) {
			Object.keys(ramps).forEach(function(k) {
				var rp = ramps[k];
				var p = rp.duration > 0 ? Math.min(1, Math.max(0, (t - rp.start) / rp.duration)) : 1;
				r.outputs[k] = rp.from + (rp.to - rp.from) * ease(rp.ease, p);
				if(p >= 1) { r.outputs[k] = rp.to; delete ramps[k]; }
			});
			Object.keys(blinks).forEach(function(k) {
				var b = blinks[k];
				if(b.end !== null && t >= b.end) { r.outputs[k] = b.lo; delete blinks[k]; return; }
				var on = (Math.floor((t - b.start) / b.every) % 2 === 0) !== b.alt;
				r.outputs[k] = on ? b.hi : b.lo;
			});
		}

		function fire(line, t, instant) {
			if(line.kind === 'set') {
				cancel(line.out);
				r.outputs[line.out] = line.value;
			}
			else if(line.kind === 'ramp') {
				cancel(line.out);
				var from = typeof r.outputs[line.out] === 'number' ? r.outputs[line.out] : 0;
				if(instant || line.duration === 0) { r.outputs[line.out] = line.to; }
				else { ramps[line.out] = {start: t, duration: line.duration, from: from, to: line.to, ease: line.ease}; }
			}
			else if(line.kind === 'blink') {
				line.outs.forEach(function(out, i) {
					cancel(out);
					blinks[out] = {start: t, every: line.every, lo: line.lo, hi: line.hi, alt: i === 1,
						end: (line.duration === null || instant) ? null : t + line.duration};
					if(instant && line.duration !== null) { delete blinks[out]; r.outputs[out] = line.lo; }
				});
			}
		}

		function setRunning() {
			if(scene.runningOut !== -1) {
				r.outputs[scene.runningOut] = (r.phase === 'waiting' || r.phase === 'playing') ? 1 : 0;
			}
		}

		// The cue at `index` is next: work out when it may start.
		function enterCue(index, t) {
			r.cueIndex = index;
			current = scene.cues[index];
			prevEnd = t;
			fired = 0;
			var trig = current.trigger;
			waitUntil = null;
			if(trig.type === 'after') { waitUntil = t + trig.min + (trig.max - trig.min) * random(); }
			else if(trig.type === 'when' && trig.max !== null) { waitUntil = t + trig.max; }
			r.phase = 'waiting';
			if(trig.type === 'next') { startCue(t); }
		}

		function startCue(t) {
			r.phase = 'playing';
			cueStart = t;
			round = 1;
		}

		// The current cue has just finished a round: play it again?
		function loopsAgain(ins) {
			var lp = current.loop;
			if(!lp) { return false; }
			if(lp.type === 'forever') { return true; }
			if(lp.type === 'times') { return round < lp.count; }
			return !levelMet(lp, ins);
		}

		function endScene(t) {
			Object.keys(blinks).forEach(function(k) { r.outputs[k] = blinks[k].lo; });
			blinks = {};
			r.phase = 'ended';
			current = null;
			setRunning();
		}

		function levelMet(trig, ins) {
			var v = parseFloat(ins ? ins[trig.inlet] : NaN);
			if(isNaN(v)) { return false; }
			var threshold = parseFloat(ins.threshold);
			if(isNaN(threshold)) { threshold = 512; }
			return trig.level === 'high' ? v >= threshold : v < threshold;
		}

		function isHigh(inlet, ins) {
			var v = parseFloat(ins ? ins[inlet] : NaN), threshold = parseFloat(ins ? ins.threshold : NaN);
			if(isNaN(threshold)) { threshold = 512; }
			return !isNaN(v) && v >= threshold;
		}

		// A waiting cue's "when": a level, or for rises/falls a change
		// since the last tick. A change is used up once seen, so it
		// starts one cue, not every rises cue after it in the same tick.
		function whenMet(trig, ins) {
			if(trig.level === 'high' || trig.level === 'low') { return levelMet(trig, ins); }
			var was = wasHigh[trig.inlet];
			if(was === undefined) { return false; }
			var high = isHigh(trig.inlet, ins);
			if(trig.level === 'rises' ? (!was && high) : (was && !high)) {
				wasHigh[trig.inlet] = high;
				return true;
			}
			return false;
		}

		/**
		 * tick - bring the scene up to time `now`. ins: {in1, in2,
		 * threshold}, read by "when" cues.
		 */
		r.tick = function(now, ins) {
			var changes = 0;
			while(changes < MAX_CUE_CHANGES_PER_TICK) {
				if(r.phase === 'waiting') {
					var trig = current.trigger;
					if(trig.type === 'when' && whenMet(trig, ins)) {
						// Seen now - unless max ran out before this tick.
						var at = (waitUntil !== null && waitUntil < now) ? waitUntil : now;
						advanceTo(at);
						startCue(at);
					}
					else if(waitUntil !== null && waitUntil <= now) {
						advanceTo(waitUntil);
						startCue(waitUntil);
					}
					else { break; }
				}
				if(r.phase !== 'playing' && r.phase !== 'stopping') { break; }

				var lines = r.phase === 'stopping' ? scene.idle : current.lines;
				var length = r.phase === 'stopping' ? scene.idleLength : current.length;
				// Lines due by now, in time order.
				while(fired < lines.length && cueStart + lines[fired].at <= now) {
					var due = cueStart + lines[fired].at;
					advanceTo(due);
					fire(lines[fired], due, false);
					fired++;
				}
				if(fired < lines.length || cueStart + length > now) { break; }

				// This cue (or the idle lines) has finished.
				var end = cueStart + length;
				advanceTo(end);
				changes++;
				if(r.phase === 'stopping') { r.phase = 'idle'; r.cueIndex = -1; current = null; break; }
				if(loopsAgain(ins)) { round++; cueStart = end; fired = 0; continue; }
				if(r.cueIndex + 1 < scene.cues.length) { enterCue(r.cueIndex + 1, end); }
				else if(scene.repeat !== null) { enterCue(scene.repeat, end); }
				else { endScene(end); break; }
			}
			advanceTo(now);
			setRunning();
			wasHigh.in1 = isHigh('in1', ins);
			wasHigh.in2 = isHigh('in2', ins);
		};

		/** play - from the first cue, at time `now`. */
		r.play = function(now) {
			if(!scene.ok || !scene.cues.length) { return; }
			advanceTo(now);
			enterCue(0, now);
			setRunning();
		};

		/**
		 * stop - play the idle lines from `now`; with no idle section,
		 * freeze where everything is. Does nothing unless playing,
		 * waiting or ended.
		 */
		r.stop = function(now) {
			if(['waiting', 'playing', 'ended'].indexOf(r.phase) === -1) { return; }
			advanceTo(now);
			if(!scene.hasIdle) {
				ramps = {};
				blinks = {};
				r.phase = 'idle';
				r.cueIndex = -1;
				current = null;
			}
			else {
				r.phase = 'stopping';
				cueStart = now;
				fired = 0;
				current = null;
			}
			setRunning();
		};

		/**
		 * applyIdle - the idle lines, at once: ramps land on their end
		 * value, times are ignored. Blinks start (one with a "for" ends
		 * at once). For when the patch loads or the script changes.
		 */
		r.applyIdle = function(now) {
			ramps = {};
			blinks = {};
			scene.idle.forEach(function(line) { fire(line, now, true); });
			r.phase = 'idle';
			r.cueIndex = -1;
			current = null;
			advanceTo(now);
			setRunning();
		};

		/**
		 * skipWait - start a waiting cue now, as if its "when" happened.
		 * The widget's way to test a scene with no sensor wired in.
		 */
		r.skipWait = function(now) {
			if(r.phase !== 'waiting') { return; }
			advanceTo(now);
			startCue(now);
			setRunning();
		};

		/** status - for the widget's display. */
		r.status = function(now) {
			var s = {phase: r.phase, cue: '', progress: 0, waitingFor: '', loop: '', lines: [], linesLeft: {}};
			if(r.phase === 'waiting') { s.lines = [current.line]; }
			if(r.phase === 'playing') { s.lines = [current.line].concat(activeLines(current.lines, now - cueStart, s.linesLeft)); }
			if(r.phase === 'stopping') { s.lines = activeLines(scene.idle, now - cueStart, s.linesLeft); }
			if(r.phase === 'waiting' || r.phase === 'playing') { s.cue = current.label; }
			if(r.phase === 'playing' && current.loop) {
				var lp = current.loop;
				if(lp.type === 'times') { s.loop = 'loop ' + round + ' of ' + lp.count; }
				else if(lp.type === 'until') { s.loop = 'loop ' + round + ' until ' + lp.inlet + ' ' + lp.level; }
				else { s.loop = 'loop ' + round; }
			}
			if(r.phase === 'stopping') { s.cue = 'idle'; }
			if(r.phase === 'playing' || r.phase === 'stopping') {
				var length = r.phase === 'stopping' ? scene.idleLength : current.length;
				s.progress = length > 0 ? Math.min(1, (now - cueStart) / length) : 1;
			}
			if(r.phase === 'waiting') {
				var trig = current.trigger;
				if(trig.type === 'when') { s.waitingFor = trig.inlet + ' ' + trig.level; }
				if(waitUntil !== null) {
					var left = Math.max(0, waitUntil - now) / 1000;
					s.waitingFor += (s.waitingFor ? ' · ' : '') + left.toFixed(1) + 's';
					s.progress = waitUntil > prevEnd ? Math.min(1, (now - prevEnd) / (waitUntil - prevEnd)) : 1;
				}
			}
			return s;
		};

		return r;
	}

	return {
		parse: parse,
		createRunner: createRunner,
		EASINGS: Object.keys(EASINGS),
	};
});
