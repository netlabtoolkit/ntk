define([], function() {
	'use strict';

	// A small, deliberately-limited Markdown -> HTML converter for the
	// Text widget's display box. Source text is HTML-escaped first, so no
	// raw HTML (or <script>) from an inlet / imported file / LLM output
	// can execute - only the fixed set of tags this function emits.
	//
	// Supports: # headings, **bold**, *italic* / _italic_, `code`,
	// ``` fenced code ```, - / * / + and 1. lists, > blockquotes,
	// [text](url), --- rules, paragraphs, and trailing-space line breaks.

	function esc(s) {
		return String(s)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
	}

	function inline(s) {
		return s
			// links: [text](url) - url is escaped, javascript: stripped
			.replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, function(m, text, url) {
				if (/^\s*javascript:/i.test(url)) { return text; }
				return '<a href="' + url.replace(/"/g, '&quot;') + '" target="_blank">' + text + '</a>';
			})
			.replace(/`([^`]+)`/g, '<code>$1</code>')
			.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
			.replace(/__([^_]+)__/g, '<strong>$1</strong>')
			.replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>')
			.replace(/(^|[^_])_([^_\s][^_]*?)_/g, '$1<em>$2</em>');
	}

	return function miniMarkdown(src) {
		var lines = esc(src == null ? '' : src).replace(/\r\n?/g, '\n').split('\n');
		var out = [];
		var i = 0;

		function closeList(stack) {
			while (stack.length) { out.push('</' + stack.pop() + '>'); }
		}

		var listStack = [];       // 'ul' / 'ol'
		var paraBuf = [];

		function flushPara() {
			if (paraBuf.length) {
				out.push('<p>' + inline(paraBuf.join(' ')) + '</p>');
				paraBuf = [];
			}
		}

		while (i < lines.length) {
			var line = lines[i];

			// fenced code block
			var fence = line.match(/^```(.*)$/);
			if (fence) {
				flushPara(); closeList(listStack);
				var code = [];
				i++;
				while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i++; }
				i++; // skip closing fence
				out.push('<pre><code>' + code.join('\n') + '</code></pre>');
				continue;
			}

			// horizontal rule
			if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
				flushPara(); closeList(listStack);
				out.push('<hr>');
				i++; continue;
			}

			// heading
			var h = line.match(/^(#{1,6})\s+(.*)$/);
			if (h) {
				flushPara(); closeList(listStack);
				var lvl = h[1].length;
				out.push('<h' + lvl + '>' + inline(h[2].trim()) + '</h' + lvl + '>');
				i++; continue;
			}

			// blockquote (one level)
			var q = line.match(/^\s*&gt;\s?(.*)$/);
			if (q) {
				flushPara(); closeList(listStack);
				var quote = [];
				while (i < lines.length) {
					var qm = lines[i].match(/^\s*&gt;\s?(.*)$/);
					if (!qm) { break; }
					quote.push(qm[1]);
					i++;
				}
				out.push('<blockquote>' + inline(quote.join(' ')) + '</blockquote>');
				continue;
			}

			// list item
			var ul = line.match(/^(\s*)[-*+]\s+(.*)$/);
			var ol = line.match(/^(\s*)\d+\.\s+(.*)$/);
			if (ul || ol) {
				flushPara();
				var want = ul ? 'ul' : 'ol';
				if (!listStack.length || listStack[listStack.length - 1] !== want) {
					closeList(listStack);
					out.push('<' + want + '>');
					listStack.push(want);
				}
				out.push('<li>' + inline((ul || ol)[2].trim()) + '</li>');
				i++; continue;
			}

			// blank line -> paragraph / list break
			if (/^\s*$/.test(line)) {
				flushPara(); closeList(listStack);
				i++; continue;
			}

			// plain text - accumulate into a paragraph; a trailing "  "
			// (two spaces) forces a <br>
			closeList(listStack);
			if (/  $/.test(line)) {
				paraBuf.push(line.replace(/\s+$/, '') + '<br>');
			} else {
				paraBuf.push(line.trim());
			}
			i++;
		}

		flushPara();
		closeList(listStack);
		return out.join('\n');
	};
});
