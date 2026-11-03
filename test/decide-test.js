// Tests for the Decide widget's question script (app/scripts/utils/DecideScript.js).
//   node test/decide-test.js
'use strict';

const assert = require('assert');
const DecideScript = require('../app/scripts/utils/DecideScript.js');

let failed = 0;
function test(name, fn) {
	try { fn(); console.log('ok   ' + name); }
	catch(e) { failed++; console.log('FAIL ' + name + '\n     ' + e.message); }
}
const messages = r => r.errors.map(e => 'line ' + e.line + ': ' + e.message);

test('the plan example parses', () => {
	const r = DecideScript.parse([
		'lights: choice on | off | dim | none=Not about the lights',
		'        What does the speaker want the lights to do?',
		'upset:  yes/no Is the speaker frustrated or annoyed?',
		'mood:   score calm < neutral < agitated',
		'        How agitated is the speaker?',
	].join('\n'));
	assert.deepStrictEqual(messages(r), []);
	assert.deepStrictEqual(DecideScript.request(r.questions), {
		lights: {type: 'choice', instructions: 'What does the speaker want the lights to do?', criteria: {on: null, off: null, dim: null, none: 'Not about the lights'}},
		upset: {type: 'noul', instructions: 'Is the speaker frustrated or annoyed?'},
		mood: {type: 'score', instructions: 'How agitated is the speaker?', criteria: ['calm', 'neutral', 'agitated']},
	});
});

test('comments and blank lines are skipped; instructions can span lines', () => {
	const r = DecideScript.parse('# lamp\n\nlamp: choice on | off\n   What should the lamp do?\n   Ignore other devices.\n');
	assert.deepStrictEqual(messages(r), []);
	assert.strictEqual(r.questions[0].instructions, 'What should the lamp do? Ignore other devices.');
});

test('a choice without none gets one', () => {
	const r = DecideScript.parse('lamp: choice on | off\n  What should the lamp do?');
	assert.deepStrictEqual(r.questions[0].criteria, {on: null, off: null, none: 'None of these'});
});

test('the type names are case-insensitive', () => {
	assert.ok(DecideScript.parse('a: Yes/No Is it?').ok);
	assert.ok(DecideScript.parse('a: CHOICE x | y\n  Which?').ok);
});

test('mixed separators are errors', () => {
	assert.deepStrictEqual(messages(DecideScript.parse('i: score none < low | med | high\n  How strong?')),
		['line 1: score levels are separated by <, not |']);
	assert.deepStrictEqual(messages(DecideScript.parse('c: choice a < b | c\n  Which?')),
		['line 1: choice options are separated by |, not <']);
});

test('option and level counts are checked', () => {
	assert.deepStrictEqual(messages(DecideScript.parse('c: choice only\n  Which?')),
		['line 1: a choice needs 2 to 26 options (this has 1)']);
	const eleven = Array.from({length: 11}, (_, i) => 'l' + i).join(' < ');
	assert.deepStrictEqual(messages(DecideScript.parse('s: score ' + eleven + '\n  How much?')),
		['line 1: a score needs 2 to 10 levels (this has 11)']);
});

test('names must be unique, options too', () => {
	assert.deepStrictEqual(messages(DecideScript.parse('a: yes/no One?\nA: yes/no Two?')), ['line 2: "A" is used twice']);
	assert.deepStrictEqual(messages(DecideScript.parse('c: choice x | y | x\n  Which?')), ['line 1: option "x" is listed twice']);
});

test('instructions are required', () => {
	assert.deepStrictEqual(messages(DecideScript.parse('a: yes/no')), ['line 1: "a" needs the question in words after yes/no']);
	assert.deepStrictEqual(messages(DecideScript.parse('c: choice x | y')), ['line 1: "c" needs the question in words, on an indented line below']);
});

test('at most four questions', () => {
	const five = ['a', 'b', 'c', 'd', 'e'].map(n => n + ': yes/no Is it ' + n + '?').join('\n');
	assert.deepStrictEqual(messages(DecideScript.parse(five)), ['line 5: at most 4 questions, one per outlet']);
});

test('lines it can\'t read', () => {
	assert.deepStrictEqual(messages(DecideScript.parse('lights: maybe on | off')), ['line 1: the type after "lights:" must be choice, yes/no or score']);
	assert.deepStrictEqual(messages(DecideScript.parse('turn the lights on')), ['line 1: a question starts with "name: choice", "name: yes/no" or "name: score"']);
	assert.deepStrictEqual(messages(DecideScript.parse('  What?')), ['line 1: an indented line goes under a question, as its instructions']);
	assert.deepStrictEqual(messages(DecideScript.parse('')), ['line 1: no questions yet']);
});

test('answers become outlet values', () => {
	const qs = DecideScript.parse('l: choice on | off\n  ?\nu: yes/no Upset?\nm: score calm < neutral < agitated\n  ?').questions;
	assert.deepStrictEqual(DecideScript.answer(qs[0], {type: 'choice', choice: 'none', confidence: 0.9}),
		{value: 'none', text: 'none', confidence: 0.9, none: true});
	const yes = DecideScript.answer(qs[1], {type: 'noul', noul: 0.9});
	assert.strictEqual(yes.value, 921);
	assert.strictEqual(yes.text, 'yes');
	assert.ok(Math.abs(yes.confidence - 0.8) < 1e-9);
	assert.strictEqual(DecideScript.answer(qs[1], {type: 'noul', noul: 0.3}, {binary: true}).value, 0);
	assert.strictEqual(DecideScript.answer(qs[1], {type: 'noul', noul: 0.6}, {binary: true}).value, 1023);
	assert.deepStrictEqual(DecideScript.answer(qs[2], {type: 'score', score: 1.5, legend: {0: 'calm', 1: 'neutral', 2: 'agitated'}, confidence: 0.4}),
		{value: 767, text: 'agitated', confidence: 0.4, none: false});
	assert.strictEqual(DecideScript.answer(qs[2], {type: 'score', score: 0.4, confidence: 0.6}).text, 'calm');
});

if(failed) { console.log(failed + ' failed'); process.exit(1); }
console.log('all passed');
