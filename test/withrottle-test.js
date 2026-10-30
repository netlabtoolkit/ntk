// WiThrottle protocol, simulated station and WiThrottleModel, no station
// needed:  node test/withrottle-test.js

'use strict';

var assert = require('assert');
var path = require('path');
var wt = require(path.join(__dirname, '../server/modules/nlHardware/withrottle'));
var WiThrottleModel = require(path.join(__dirname, '../server/modules/nlHardware/WiThrottleModel'));

var failures = 0;
function check(name, fn) {
	try { fn(); console.log('ok   ' + name); }
	catch (e) { failures++; console.log('FAIL ' + name + '\n     ' + e.message); }
}

// ----- parsing, with lines as the EX-CSB1 sent them in the spike -----

check('loco keys', function() {
	assert.strictEqual(wt.locoKey(3), 'S3');
	assert.strictEqual(wt.locoKey('127'), 'S127');
	assert.strictEqual(wt.locoKey(128), 'L128');
	assert.strictEqual(wt.locoKey(0), null);
	assert.strictEqual(wt.locoKey(2.5), null);
	assert.strictEqual(wt.locoKey('x'), null);
});

check('session lines', function() {
	assert.deepStrictEqual(wt.parseLine('VN2.0'), [{type: 'version', value: '2.0'}]);
	assert.deepStrictEqual(wt.parseLine('*10'), [{type: 'heartbeat', seconds: 10}]);
	assert.deepStrictEqual(wt.parseLine('PPA1'), [{type: 'power', value: 1}]);
	assert.deepStrictEqual(wt.parseLine('PPA2'), [{type: 'power', value: null}]);
	assert.deepStrictEqual(wt.parseLine('HMConnected'), [{type: 'message', text: 'Connected'}]);
	assert.deepStrictEqual(wt.parseLine('RL0'), []);
});

check('loco lines', function() {
	assert.deepStrictEqual(wt.parseLine('MT+S3<;>'), [{type: 'acquired', throttle: 'T', key: 'S3'}]);
	assert.deepStrictEqual(wt.parseLine('MTAS3<;>V50'), [{type: 'speed', throttle: 'T', key: 'S3', value: 50, estop: false}]);
	assert.deepStrictEqual(wt.parseLine('MTAS3<;>V-1'), [{type: 'speed', throttle: 'T', key: 'S3', value: 0, estop: true}]);
	assert.deepStrictEqual(wt.parseLine('MTAS3<;>R0'), [{type: 'direction', throttle: 'T', key: 'S3', value: 0}]);
	assert.deepStrictEqual(wt.parseLine('MTAS3<;>F112'), [{type: 'function', throttle: 'T', key: 'S3', fn: 12, value: 1}]);
	assert.deepStrictEqual(wt.parseLine('MTAS3<;>s1'), []);
	assert.deepStrictEqual(wt.parseLine('M0-L1234<;>'), [{type: 'released', throttle: '0', key: 'L1234'}]);
});

check('commands', function() {
	assert.strictEqual(wt.commands.acquire('T', 'S3'), 'MT+S3<;>S3');
	assert.strictEqual(wt.commands.speed('T', 'S3', 40), 'MTAS3<;>V40');
	assert.strictEqual(wt.commands.estop('T', 'S3'), 'MTAS3<;>X');
	assert.deepStrictEqual(wt.commands.toggleFunction('T', 'S3', 0), ['MTAS3<;>F10', 'MTAS3<;>F00']);
	assert.strictEqual(wt.commands.release('T', 'S3'), 'MT-S3<;>r');
});

// ----- the simulated station, two clients -----

check('simulator announces to every holder', function() {
	var station = wt.createSimulatedStation();
	var a = [], b = [];
	var ca = station.connect(function(l) { a.push(l); });
	var cb = station.connect(function(l) { b.push(l); });
	assert.deepStrictEqual(a.slice(0, 5), ['VN2.0', 'RL0', 'PPA0', 'PTL', '*10']);

	ca.receive('MT+S3<;>S3');
	cb.receive('M0+S3<;>S3');
	assert.ok(a.indexOf('MTAS3<;>F00') !== -1 && a.indexOf('MTAS3<;>V0') !== -1);
	a.length = 0; b.length = 0;

	ca.receive('MTAS3<;>V40');
	assert.deepStrictEqual(a, ['MTAS3<;>V40']);
	assert.deepStrictEqual(b, ['M0AS3<;>V40']);

	cb.receive('M0AS3<;>F10');
	assert.deepStrictEqual(a.slice(-1), ['MTAS3<;>F10']);
	assert.strictEqual(station.state().locos.S3.fns[0], 1);

	ca.receive('MTA*<;>X');
	assert.deepStrictEqual(b.slice(-1), ['M0AS3<;>V-1']);

	ca.receive('PPA1');
	assert.deepStrictEqual(b.slice(-1), ['PPA1']);
});

// ----- WiThrottleModel against the simulated station -----

function wait(ms) { return new Promise(function(resolve) { setTimeout(resolve, ms); }); }

async function modelTests() {
	var model = new WiThrottleModel({address: 'simulated', port: 2560});
	var changes = [], statuses = [];
	model.on('change', function(c) { changes.push(c); });
	model.on('status', function(s) { statuses.push(s); });

	model.setIOMode('S3', 'acquire', {wid: 'w1'});
	await wait(50);
	check('model connects and acquires', function() {
		assert.ok(statuses.some(function(s) { return s.connected; }), 'never connected');
		assert.ok(changes.some(function(c) { return c.field === 'S3:acquired' && c.value === 1; }), 'never acquired');
		assert.strictEqual(model.locos.S3.acquired, true);
	});

	// A fast run of speeds: only some are sent, echoes don't pull the
	// speed back, the last one wins.
	changes.length = 0;
	for (var s = 1; s <= 20; s++) { model.set('S3:speed', s); await wait(10); }
	await wait(300);
	check('speed stream ends on the last value', function() {
		assert.strictEqual(model.locos.S3.speed, 20);
		assert.strictEqual(model.locos.S3.sentSpeed, 20);
		var speeds = changes.filter(function(c) { return c.field === 'S3:speed'; }).map(function(c) { return c.value; });
		for (var i = 1; i < speeds.length; i++) {
			assert.ok(speeds[i] > speeds[i - 1], 'speed went backwards: ' + speeds.join(','));
		}
	});

	// Someone else's throttle on the same simulated station.
	var other = new WiThrottleModel({address: 'simulated', port: 2560});
	other.setIOMode('S3', 'acquire', {wid: 'w9'});
	await wait(50);
	check('second session sees the speed', function() {
		assert.strictEqual(other.locos.S3.speed, 20);
	});
	changes.length = 0;
	other.set('S3:speed', 7);
	other.set('S3:direction', 0);
	await wait(150);
	check('remote change reaches the first session', function() {
		assert.strictEqual(model.locos.S3.speed, 7);
		assert.strictEqual(model.locos.S3.direction, 0);
		assert.ok(changes.some(function(c) { return c.field === 'S3:speed' && c.value === 7; }));
	});

	model.set('S3:f0', 1);
	await wait(50);
	check('function set reaches both', function() {
		assert.strictEqual(model.locos.S3.fns[0], 1);
		assert.strictEqual(other.locos.S3.fns[0], 1);
	});
	model.set('S3:f0', 1);
	await wait(50);
	check('setting a function already on leaves it on', function() {
		assert.strictEqual(model.locos.S3.fns[0], 1);
	});

	model.set('S3:stop', 1);
	await wait(50);
	check('stop', function() {
		assert.strictEqual(model.locos.S3.speed, 0);
		assert.strictEqual(other.locos.S3.speed, 0);
	});

	// A second widget on the same loco in the same NTK: released only
	// when both are done.
	model.setIOMode('S3', 'acquire', {wid: 'w2'});
	model.setIOMode('S3', 'release', {wid: 'w1'});
	check('still held by the second widget', function() {
		assert.ok(model.locos.S3);
	});
	model.setIOMode('S3', 'release', {wid: 'w2'});
	check('released when the last widget lets go', function() {
		assert.ok(!model.locos.S3);
	});

	model.close();
	other.close();
	await wait(20);

	// Nothing listening on this port - an error status, not a crash.
	var nobody = new WiThrottleModel({address: '127.0.0.1', port: 1});
	var nobodyStatus = [];
	nobody.on('status', function(s) { nobodyStatus.push(s); });
	nobody.setIOMode('S3', 'acquire', {wid: 'w1'});
	await wait(300);
	check('unreachable station reports an error', function() {
		assert.ok(nobodyStatus.some(function(s) { return s.error && /refused/.test(s.error); }), JSON.stringify(nobodyStatus));
	});
	nobody.close();
}

modelTests().then(function() {
	console.log(failures ? failures + ' failed' : 'all WiThrottle checks pass');
	process.exit(failures ? 1 : 0);
});
