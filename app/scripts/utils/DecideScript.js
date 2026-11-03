(function(factory) {
	// Loads in the app (RequireJS) and in Node, for test/decide-test.js.
	if(typeof define === 'function' && define.amd) { define([], factory); }
	else { module.exports = factory(); }
})(function() {
	'use strict';

	/**
	 * The Decide widget's question script (plans/decision-widget.md):
	 *
	 *   lights: choice on | off | dim | none=Not about the lights
	 *           What does the speaker want the lights to do?
	 *   upset:  yes/no Is the speaker frustrated or annoyed?
	 *   mood:   score calm < neutral < agitated
	 *           How agitated is the speaker?
	 *
	 * parse() reads it into questions, request() turns them into the
	 * `questions` of a /v1/systemone request, and answer() reads one
	 * answer back into what the widget shows and sends. No DOM, so the
	 * same code runs under the tests.
	 */

	var MAX_QUESTIONS = 4;          // one per outlet
	var MAX_CHOICES = 26;           // Ollama's limit
	var MAX_LEVELS = 10;            // TypeSafe's limit (Ollama allows 26)
	var NONE_DESCRIPTION = 'None of these';
	var HEAD = /^([A-Za-z_][\w-]*)\s*:\s*(choice|yes\/no|score)\b\s*(.*)$/i;
	var NAME = /^[A-Za-z_][\w-]*:/;

	function parse(text) {
		var questions = [], errors = [], current = null;
		var names = {};
		function error(line, message) { errors.push({line: line, message: message}); }

		String(text || '').split('\n').forEach(function(raw, i) {
			var n = i + 1;
			var line = raw.replace(/\s+$/, '');
			var trimmed = line.trim();
			if(!trimmed || trimmed.charAt(0) === '#') { return; }
			var indented = /^\s/.test(raw);

			if(!indented) {
				var head = HEAD.exec(line);
				if(!head) {
					if(NAME.test(trimmed)) { error(n, 'the type after "' + trimmed.split(':')[0] + ':" must be choice, yes/no or score'); }
					else { error(n, 'a question starts with "name: choice", "name: yes/no" or "name: score"'); }
					current = null;
					return;
				}
				var name = head[1], type = head[2].toLowerCase(), rest = head[3].trim();
				if(names[name.toLowerCase()]) { error(n, '"' + name + '" is used twice'); }
				names[name.toLowerCase()] = true;
				var q = {name: name, line: n, instructions: ''};

				if(type === 'yes/no') {
					q.type = 'noul';
					q.instructions = rest;
				}
				else if(type === 'choice') {
					q.type = 'choice';
					q.criteria = {};
					if(rest.indexOf('<') !== -1) { error(n, 'choice options are separated by |, not <'); }
					var options = rest.split('|').map(function(s) { return s.trim(); }).filter(Boolean);
					options.forEach(function(opt) {
						var eq = opt.indexOf('=');
						var key = (eq > 0 ? opt.slice(0, eq) : opt).trim();
						var desc = eq > 0 ? opt.slice(eq + 1).trim() : null;
						if(!key) { error(n, 'an option has no name before "="'); return; }
						if(Object.prototype.hasOwnProperty.call(q.criteria, key)) { error(n, 'option "' + key + '" is listed twice'); }
						q.criteria[key] = desc || null;
					});
					var count = Object.keys(q.criteria).length;
					if(count < 2 || count > MAX_CHOICES) { error(n, 'a choice needs 2 to ' + MAX_CHOICES + ' options (this has ' + count + ')'); }
					// Always a way out for text that fits nothing.
					if(!Object.prototype.hasOwnProperty.call(q.criteria, 'none')) { q.criteria.none = NONE_DESCRIPTION; }
				}
				else {
					q.type = 'score';
					if(rest.indexOf('|') !== -1) { error(n, 'score levels are separated by <, not |'); }
					q.criteria = rest.split('<').map(function(s) { return s.trim(); }).filter(Boolean);
					if(q.criteria.length < 2 || q.criteria.length > MAX_LEVELS) { error(n, 'a score needs 2 to ' + MAX_LEVELS + ' levels (this has ' + q.criteria.length + ')'); }
				}
				questions.push(q);
				current = q;
			}
			else if(current) {
				current.instructions = (current.instructions ? current.instructions + ' ' : '') + trimmed;
			}
			else {
				error(n, 'an indented line goes under a question, as its instructions');
			}
		});

		if(questions.length === 0 && errors.length === 0) { errors.push({line: 1, message: 'no questions yet'}); }
		if(questions.length > MAX_QUESTIONS) {
			error(questions[MAX_QUESTIONS].line, 'at most ' + MAX_QUESTIONS + ' questions, one per outlet');
		}
		questions.forEach(function(q) {
			if(!q.instructions) {
				error(q.line, '"' + q.name + '" needs the question in words' + (q.type === 'noul' ? ' after yes/no' : ', on an indented line below'));
			}
		});
		errors.sort(function(a, b) { return a.line - b.line; });
		return {ok: errors.length === 0, questions: questions, errors: errors};
	}

	// The `questions` object of a /v1/systemone request.
	function request(questions) {
		var out = {};
		questions.forEach(function(q) {
			var r = {type: q.type, instructions: q.instructions};
			if(q.criteria) { r.criteria = q.criteria; }
			out[q.name] = r;
		});
		return out;
	}

	/**
	 * answer - one answer as the widget uses it.
	 *  value:      the outlet value - the option name for a choice; 0-1023
	 *              for yes/no (probability of yes) and score (weighted level)
	 *  text:       short display ("dim", "yes", "calm")
	 *  confidence: 0-1. yes/no answers have none of their own (TypeSafe's
	 *              schema), so it's how far the probability is from 0.5.
	 *  none:       a choice that came out "none"
	 *
	 * @param  {object} q       a parsed question
	 * @param  {object} a       its answer from /v1/systemone
	 * @param  {object} options {binary: yes/no sends 0 or 1023}
	 */
	function answer(q, a, options) {
		options = options || {};
		if(!a) { return null; }
		if(q.type === 'choice') {
			return {value: a.choice, text: String(a.choice), confidence: num(a.confidence), none: a.choice === 'none'};
		}
		if(q.type === 'noul') {
			var p = num(a.noul);
			return {
				value: options.binary ? (p >= 0.5 ? 1023 : 0) : Math.round(p * 1023),
				text: p >= 0.5 ? 'yes' : 'no',
				confidence: Math.abs(p - 0.5) * 2,
				none: false,
			};
		}
		var levels = q.criteria.length;
		var score = Math.max(0, Math.min(levels - 1, num(a.score)));
		var level = Math.round(score);
		var label = (a.legend && a.legend[String(level)]) || q.criteria[level];
		return {value: Math.round(score / (levels - 1) * 1023), text: String(label), confidence: num(a.confidence), none: false};
	}

	function num(v) {
		var n = parseFloat(v);
		return isNaN(n) ? 0 : n;
	}

	// ---- writing the script with an LLM (the more panel's Generate) ----
	// The system prompt: the spike's v2 (plans/decision-widget.md, 6b),
	// plus the gate rule. The reply is the script, then a TEST PHRASES
	// section - plain text, no JSON, so any chat model can manage it.

	var GENERATOR_PROMPT = [
		'You write question scripts for "Decide", a widget in a prototyping tool. Decide sends some text (usually what a person said, from speech recognition) to a fast decision model that can only answer multiple-choice style questions: it picks options, it never writes text.',
		'',
		'Write the script in exactly this format:',
		'',
		'name: choice option1 | option2 | none=Not about this',
		'      Instructions line: the question, in plain words.',
		'name: yes/no The question, in plain words.',
		'name: score lowest < middle < highest',
		'      Instructions line: what is being scored.',
		'',
		'Rules:',
		'- At most 4 questions. Each becomes one output of the widget, in order.',
		'- Question names: one word, lowercase, letters/digits/underscore, unique.',
		'- choice: 2 to 26 options separated by |. Option names are short single words. Add =description after an option only if the name alone is unclear. Always include a "none" option for input that doesn\'t fit.',
		'- Prefer choice and yes/no questions: the decision model answers them most reliably. Use a score only when the request really asks "how much" or "how strongly".',
		'- score: 3 or 4 levels separated by <, lowest first. The lowest level must also cover input the question doesn\'t apply to (for example "none" or "not at all"), because a score has no separate "none" answer. Give each level a name that is clearly different from its neighbours.',
		'- With more than one question, make the first one a choice whose "none" option catches input that is off-topic: while the first answer is none, the widget holds its other outputs.',
		'- yes/no questions put the question on the same line.',
		'- Indent the instructions line with spaces.',
		'- Ask only what the person\'s request needs. Every extra question makes the widget slower (each one takes a fraction of a second), so prefer fewer, clearer questions; one or two is often enough.',
		'- The decision model can only pick from the options listed, so it can\'t pass on a number or a name it hears. For a number, list the values that make sense as options.',
		'',
		'After the script, write a line with exactly "TEST PHRASES", then 6 to 8 example inputs, one per line, in the form:',
		'phrase => name=value, name=value',
		'using every question\'s name. Values: an option name for choice, yes or no for yes/no, a level name for score. Include at least two phrases that are off-topic or should trigger nothing.',
		'',
		'Reply with the script and the test phrases only. No other text, no code fences.',
		'',
		'Example request: Turn the lamp on when someone asks for light, dim it if they want to relax, and tell me if they sound annoyed.',
		'Example reply:',
		'lamp: choice on | off | dim | none=Not about the lamp',
		'      What does the speaker want the lamp to do?',
		'annoyed: yes/no Does the speaker sound annoyed or frustrated?',
		'TEST PHRASES',
		'turn the lamp on please => lamp=on, annoyed=no',
		'I just want to relax for a bit => lamp=dim, annoyed=no',
		'why is it so dark in here, seriously => lamp=on, annoyed=yes',
		'what\'s for dinner? => lamp=none, annoyed=no',
		'',
		'Example request: A robot face that looks happy, sad or surprised depending on what people tell it, and gets more excited the more enthusiastic they are.',
		'Example reply:',
		'face: choice happy | sad | surprised | none=Neutral or unclear',
		'      Which expression fits how the robot should react to what was said?',
		'excitement: score none < some < very',
		'      How enthusiastic is the speaker? none if they show no enthusiasm at all.',
		'TEST PHRASES',
		'I got the job! => face=happy, excitement=very',
		'my cat died yesterday => face=sad, excitement=none',
		'wait, you can talk?! => face=surprised, excitement=some',
		'the bus comes at nine => face=none, excitement=none',
	].join('\n');

	/**
	 * splitGenerated - an LLM's reply into the script and its test
	 * phrases. Tolerates what chat models add anyway: code fences,
	 * <think> blocks, a "Here's the script:" line before it.
	 *
	 * @return {object} {script, tests: [{phrase, expect: {name: value}}]}
	 */
	function splitGenerated(text) {
		text = String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/```[a-z]*\s*\n?/gi, '').replace(/\r/g, '');
		var lines = text.split('\n');
		var split = -1;
		for(var i = 0; i < lines.length; i++) {
			if(/^\s*\**\s*TEST PHRASES\s*:?\s*\**\s*$/i.test(lines[i])) { split = i; break; }
		}
		var scriptLines = split === -1 ? lines : lines.slice(0, split);
		// Drop chatter before the first question line.
		var first = 0;
		while(first < scriptLines.length && !HEAD.test(scriptLines[first].replace(/\s+$/, ''))) { first++; }
		if(first === scriptLines.length) { first = 0; }
		var script = scriptLines.slice(first).join('\n').replace(/\s+$/, '');

		var tests = [];
		if(split !== -1) {
			lines.slice(split + 1).forEach(function(l) {
				var m = /^\s*(?:[-*\d.)]+\s+)?(.*?)\s*=>\s*(.+)$/.exec(l);
				if(!m) { return; }
				var expect = {};
				m[2].split(',').forEach(function(kv) {
					var eq = kv.indexOf('=');
					if(eq <= 0) { return; }
					var k = kv.slice(0, eq).trim(), v = kv.slice(eq + 1).trim();
					if(k && v) { expect[k] = v; }
				});
				var phrase = m[1].replace(/^["'“”]+|["'“”]+$/g, '').trim();
				if(phrase) { tests.push({phrase: phrase, expect: expect}); }
			});
		}
		return {script: script, tests: tests};
	}

	/**
	 * checkTest - did the answers come out as the test phrase expected?
	 * Compares the answer as shown (choice name, yes/no, score level);
	 * expectations for questions no longer in the script are skipped.
	 *
	 * @return {object} {ok: bool, checked: n, results: [{name, got, want, ok}]}
	 */
	function checkTest(questions, answers, expect, options) {
		var results = [], ok = true;
		questions.forEach(function(q) {
			var r = answer(q, answers && answers[q.name], options);
			var got = r ? r.text : '';
			var want = expect ? expect[q.name] : undefined;
			var hit = want === undefined ? null : got.toLowerCase() === String(want).toLowerCase();
			if(hit === false) { ok = false; }
			results.push({name: q.name, got: got, want: want, ok: hit});
		});
		return {ok: ok, checked: results.filter(function(r) { return r.ok !== null; }).length, results: results};
	}

	return {
		parse: parse,
		request: request,
		answer: answer,
		splitGenerated: splitGenerated,
		checkTest: checkTest,
		GENERATOR_PROMPT: GENERATOR_PROMPT,
		MAX_QUESTIONS: MAX_QUESTIONS,
	};
});
