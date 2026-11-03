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

	return {
		parse: parse,
		request: request,
		answer: answer,
		MAX_QUESTIONS: MAX_QUESTIONS,
	};
});
