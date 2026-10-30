#!/usr/bin/env node
// Runs test/scene-cases.json against app/scripts/utils/SceneScript.js.
//   node test/scene-test.js
// Each case runs twice: ticking only at its steps, and ticking every
// 7 ms in between, so a result that depends on the tick rate fails.

var path = require('path');
var SceneScript = require(path.join(__dirname, '../app/scripts/utils/SceneScript.js'));
var cases = require('./scene-cases.json').cases;

var failures = 0;

function fail(name, message) {
	failures++;
	console.log('FAIL ' + name + ': ' + message);
}

function outletIndex(scene, key) {
	var m = /^out([1-4])$/.exec(key);
	return m ? parseInt(m[1], 10) - 1 : scene.outs.indexOf(key);
}

function close(a, b) {
	if(typeof a === 'number' && typeof b === 'number') { return Math.abs(a - b) < 1e-6; }
	return a === b;
}

function runSteps(c, scene, tickEvery) {
	var randoms = (c.random || []).slice();
	var runner = SceneScript.createRunner(scene, {random: function() { return randoms.length ? randoms.shift() : 0; }});
	var ins = {in1: undefined, in2: undefined, threshold: 512};
	var t = 0;
	runner.applyIdle(0);
	var label = c.name + (tickEvery ? ' (ticking every ' + tickEvery + 'ms)' : '');

	c.steps.forEach(function(step) {
		if(tickEvery) {
			for(var tt = t + tickEvery; tt < step.t; tt += tickEvery) { runner.tick(tt, ins); }
		}
		t = step.t;
		if(step.in1 !== undefined) { ins.in1 = step.in1; }
		if(step.in2 !== undefined) { ins.in2 = step.in2; }
		if(step.do) { runner[step.do](t); }
		runner.tick(t, ins);
		var status = runner.status(t);
		Object.keys(step.expect || {}).forEach(function(key) {
			var want = step.expect[key], got;
			if(key === 'phase') { got = status.phase; }
			else if(key === 'cue') { got = status.cue; }
			else {
				var index = outletIndex(scene, key);
				if(index === -1) { fail(label, 'bad expect key ' + key); return; }
				got = runner.outputs[index];
			}
			if(!close(got, want)) {
				fail(label, 'at ' + t + 'ms ' + key + ' = ' + JSON.stringify(got) + ', expected ' + JSON.stringify(want));
			}
		});
	});
}

cases.forEach(function(c) {
	var scene = SceneScript.parse(c.script.join('\n'));
	var got = scene.errors.map(function(e) { return 'line ' + e.line + ': ' + e.message; });

	if(c.errors) {
		if(JSON.stringify(got) !== JSON.stringify(c.errors)) {
			fail(c.name, 'errors\n  got:      ' + got.join('\n            ') + '\n  expected: ' + c.errors.join('\n            '));
		}
		return;
	}
	if(!scene.ok) {
		fail(c.name, 'unexpected errors: ' + got.join('; '));
		return;
	}
	runSteps(c, scene, 0);
	runSteps(c, scene, 7);
});

console.log(failures ? failures + ' failure(s)' : 'all ' + cases.length + ' scene cases pass');
process.exit(failures ? 1 : 0);
