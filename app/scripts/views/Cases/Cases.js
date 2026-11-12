define([
	'backbone',
	'rivets',
	'views/item/WidgetMulti',
	'text!./template.js',
],
function(Backbone, rivets, WidgetView, Template){
	'use strict';

	/**
	 * Cases: one input tested against a list of rows, each with its own
	 * outlet - Delft's Condition node for NTK (plans/control-flow.md,
	 * Part 2). As many rows as the decision needs: the body grows with
	 * them, and each row's outlet sits beside it.
	 *
	 * Each row has an id of its own, and its outlet's field is 'c' + id -
	 * not its position - so a cable stays with its row when rows are
	 * added, deleted or moved. When the rows change, the cables from this
	 * widget are redrawn to where their outlets now are; a deleted row's
	 * cables are removed.
	 */

	var PULSE_MS = 200;
	var MAX_ROWS = 12;

	// The tests, in the order of the editor's menu. 'words' tests take a
	// comma list and match any of it.
	var TESTS = [
		{v: 'gt', label: '>', kind: 'number'},
		{v: 'lt', label: '<', kind: 'number'},
		{v: 'eq', label: '=', kind: 'either'},
		{v: 'between', label: 'between', kind: 'range'},
		{v: 'is', label: 'is', kind: 'words'},
		{v: 'contains', label: 'contains', kind: 'words'},
		{v: 'starts', label: 'starts with', kind: 'words'},
		{v: 'ends', label: 'ends with', kind: 'words'},
		{v: 'otherwise', label: 'otherwise', kind: 'none'},
	];
	var TEST_BY_V = _.indexBy ? _.indexBy(TESTS, 'v') : (function() {
		var o = {};
		_.each(TESTS, function(t) { o[t.v] = t; });
		return o;
	})();

	var DEFAULT_ROWS = [
		{id: 1, test: 'gt', value: '700', not: false},
		{id: 2, test: 'between', value: '300 700', not: false},
		{id: 3, test: 'otherwise', value: '', not: false},
	];

	function cloneRows(rows) {
		return _.map(rows || [], function(r) { return _.clone(r); });
	}

	function words(text) {
		return _.filter(_.map(String(text || '').split(','), function(w) {
			return w.trim().toLowerCase();
		}), function(w) { return w !== ''; });
	}

	// "300 700", "300, 700", "300 to 700" or "300 and 700" -> [300, 700]
	function range(text) {
		var nums = String(text || '').match(/-?\d+(\.\d+)?/g) || [];
		if(nums.length < 2) { return null; }
		var a = parseFloat(nums[0]), b = parseFloat(nums[1]);
		return [Math.min(a, b), Math.max(a, b)];
	}

	function isNumber(value) {
		return value !== '' && value !== null && value !== undefined && !isNaN(parseFloat(value)) && isFinite(value);
	}

	/**
	 * rowLabel - a row as the body shows it: "> 700", "between 300 and
	 * 700", "not contains hi, hey", "otherwise".
	 */
	function rowLabel(row) {
		var test = TEST_BY_V[row.test] || TEST_BY_V.gt;
		var text;
		if(test.v === 'otherwise') { return 'otherwise'; }
		if(test.v === 'between') {
			var r = range(row.value);
			text = r ? r[0] + ' – ' + r[1] : 'between ?';
		} else if(test.kind === 'words') {
			text = test.label + ' ' + words(row.value).join(', ');
		} else {
			text = test.label + ' ' + String(row.value || '').trim();
		}
		return (row.not ? 'not ' : '') + text;
	}

	/**
	 * testRow - does this (non-otherwise) row match the input?
	 */
	function testRow(row, input) {
		var test = row.test;
		var text = String(input === undefined || input === null ? '' : input).trim().toLowerCase();
		var n = parseFloat(input), v = parseFloat(row.value);
		var m = false;
		if(test === 'gt') { m = isNumber(input) && !isNaN(v) && n > v; }
		else if(test === 'lt') { m = isNumber(input) && !isNaN(v) && n < v; }
		else if(test === 'eq') {
			m = (isNumber(input) && isNumber(String(row.value).trim())) ? n === v :
				text !== '' && text === String(row.value || '').trim().toLowerCase();
		}
		else if(test === 'between') {
			var r = range(row.value);
			m = !!r && isNumber(input) && n >= r[0] && n <= r[1];
		}
		else if(text !== '') {
			var ws = words(row.value);
			if(test === 'is') { m = _.contains(ws, text); }
			else if(test === 'contains') {
				// A word or phrase, not part of a longer word: "hi" isn't in "this".
				m = _.some(ws, function(w) {
					return new RegExp('(^|[^a-z0-9])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9])').test(text);
				});
			}
			else if(test === 'starts') { m = _.some(ws, function(w) { return text.indexOf(w) === 0; }); }
			else if(test === 'ends') { m = _.some(ws, function(w) { return text.length >= w.length && text.slice(-w.length) === w; }); }
		}
		return row.not ? !m : m;
	}

	// ---- rows that can never match ----
	//
	// Each row is described by what it matches: N, the numbers (a union
	// of intervals), and T, the text. A row is unreachable when the rows
	// above it catch all of that first. Only marked when certain - a row
	// we can't reason about is never marked.

	var INF = Infinity;
	function iv(lo, loIn, hi, hiIn) { return {lo: lo, loIn: loIn, hi: hi, hiIn: hiIn}; }
	var ALL_NUMBERS = [iv(-INF, false, INF, false)];
	var hasDigit = function(ws) { return _.some(ws, function(w) { return /\d/.test(w); }); };

	/**
	 * rowSet - {N: [intervals], T: {kind}, empty: bool, unknown: bool}.
	 * T kinds: 'none', 'all', 'words' (exact inputs), 'pattern' (any
	 * text matching contains/starts/ends), 'unknown'.
	 */
	function rowSet(row) {
		var t = row.test, value = String(row.value || '').trim();
		var v = parseFloat(value), N = [], T = {kind: 'none'}, empty = false;
		if(t === 'otherwise') { return {N: ALL_NUMBERS, T: {kind: 'all'}}; }
		if(t === 'gt' || t === 'lt' || t === 'between' || (t === 'eq' && isNumber(value))) {
			var r = t === 'between' ? range(value) : null;
			if(t === 'between' ? !r : isNaN(v)) { empty = true; }
			else if(t === 'gt') { N = [iv(v, false, INF, false)]; }
			else if(t === 'lt') { N = [iv(-INF, false, v, false)]; }
			else if(t === 'eq') { N = [iv(v, true, v, true)]; }
			else { N = [iv(r[0], true, r[1], true)]; }
			if(!row.not) { return {N: N, T: T, empty: empty}; }
			// not: every other number, and all text (a numeric test is
			// false for text, so not makes it true).
			if(empty) { return {N: ALL_NUMBERS, T: {kind: 'all'}}; }
			var a = N[0], comp = [];
			if(a.lo > -INF) { comp.push(iv(-INF, false, a.lo, !a.loIn)); }
			if(a.hi < INF) { comp.push(iv(a.hi, !a.hiIn, INF, false)); }
			return {N: comp, T: {kind: 'all'}};
		}
		// Text tests (and = with a word).
		var ws = t === 'eq' ? (value ? [value.toLowerCase()] : []) : words(row.value);
		if(!ws.length) { return row.not ? {N: ALL_NUMBERS, T: {kind: 'all'}} : {N: [], T: T, empty: true}; }
		// A number typed as a word can match a numeric input too - too
		// fiddly to be sure about, so leave such rows alone.
		if(hasDigit(ws)) { return {unknown: true, N: [], T: {kind: 'unknown'}}; }
		if(row.not) { return {N: ALL_NUMBERS, T: {kind: 'unknown'}}; }
		if(t === 'eq' || t === 'is') { return {N: [], T: {kind: 'words', words: ws}}; }
		return {N: [], T: {kind: 'pattern', test: t, words: ws}};
	}

	function mergeIntervals(list) {
		var sorted = _.sortBy(list, function(a) { return a.lo; }), out = [];
		_.each(sorted, function(a) {
			var c = out[out.length - 1];
			if(c && (a.lo < c.hi || (a.lo === c.hi && (a.loIn || c.hiIn)))) {
				if(a.hi > c.hi) { c.hi = a.hi; c.hiIn = a.hiIn; }
				else if(a.hi === c.hi) { c.hiIn = c.hiIn || a.hiIn; }
			} else {
				out.push(_.clone(a));
			}
		});
		return out;
	}

	function numbersCovered(target, earlierN) {
		var merged = mergeIntervals(earlierN);
		return _.every(target, function(t) {
			return _.some(merged, function(m) {
				return (m.lo < t.lo || (m.lo === t.lo && (m.loIn || !t.loIn))) &&
					(m.hi > t.hi || (m.hi === t.hi && (m.hiIn || !t.hiIn)));
			});
		});
	}

	function textCovered(T, earlier) {
		if(T.kind === 'none') { return true; }
		if(T.kind === 'unknown') { return false; }
		if(_.some(earlier, function(e) { return e.set.T.kind === 'all'; })) { return true; }
		if(T.kind === 'all') { return false; }
		if(T.kind === 'words') {
			// Each word is one exact input: does a row above match it?
			return _.every(T.words, function(w) {
				return _.some(earlier, function(e) { return e.row.test !== 'otherwise' && testRow(e.row, w); });
			});
		}
		// A pattern: covered by the same kind of test with a shorter word
		// ("starts with h" catches everything "starts with hi" would).
		return _.every(T.words, function(w) {
			return _.some(earlier, function(e) {
				return e.set.T.kind === 'pattern' && e.set.T.test === T.test && testRow(e.row, w);
			});
		});
	}

	function covered(set, earlier) {
		return numbersCovered(set.N, _.flatten(_.map(earlier, function(e) { return e.set.N; }), true)) &&
			textCovered(set.T, earlier);
	}

	/**
	 * unreachable - {rowId: reason} for rows that can never match.
	 */
	function unreachable(rows, match) {
		var out = {}, earlier = [];
		_.each(rows, function(row, i) {
			var set = rowSet(row);
			if(set.empty && !row.not) {
				out[row.id] = 'never matches: it needs a value';
			} else if(match === 'first' && !set.unknown && i > 0) {
				var one = _.find(earlier, function(e) { return covered(set, [e]); });
				if(one) {
					out[row.id] = 'never matches: row ' + (one.index + 1) + ' catches all of these first';
				} else if(covered(set, earlier)) {
					out[row.id] = 'never matches: the rows above catch all of these first';
				}
			}
			earlier.push({row: row, set: set, index: i});
		});
		return out;
	}

	return WidgetView.extend({
		widgetEvents: {
			'input .casesIn': 'onInputTyped',
			'click .caseRow': 'onRowClick',
			'click .casesAdd': 'addRow',
			'click .caseDelete': 'deleteRow',
			'mousedown .caseRow': 'onBodyRowDown',
			'mousedown .caseGrip': 'onGripDown',
			'change .caseTest': 'onTestChange',
			'input .caseValue': 'onValueInput',
			'change .caseNot': 'onNotChange',
		},
		// trigger is a header port (docs/trigger-and-next.md): with it
		// wired, the input is tested only when trigger rises - not on
		// every change. Cases takes no time, so it has no next; in pulse
		// mode each row's outlet is the next for its branch. The outs are
		// built from the rows (applyPortLayout below).
		ins: [
			{title: 'trigger', to: 'inTrigger', header: true},
			{title: 'in', to: 'in'},
		],
		outs: [],
		sources: [],
		typeID: 'Cases',
		className: 'cases',
		categories: ['logic'],
		template: _.template(Template),

		initialize: function(options) {
			WidgetView.prototype.initialize.call(this, options);

			// Read by onModelChange, which the set() below fires - must
			// exist first (CLAUDE.md's Rivets/Backbone gotchas).
			this._restoring = false;
			this._applied = [];        // row ids the outlets show as matching
			this._pending = null;      // {key, ids, timer} while hold runs
			this._pulseTimers = {};
			this._lastTrigger = 0;
			this._lastInput = undefined;

			var get = function(field, fallback) {
				var v = this.model.get(field);
				return v === undefined ? fallback : v;
			}.bind(this);

			var rows = cloneRows(get('rows', DEFAULT_ROWS));
			var attrs = {
				title: 'Cases',
				rows: rows,
				nextRowId: get('nextRowId', 4),
				match: get('match', 'first'),        // 'first' | 'all'
				mode: get('mode', 'onoff'),         // 'onoff' | 'pulse' | 'pass'
				hold: get('hold', 0),
				threshold: get('threshold', 512),   // the trigger port's level
				// The shared model defaults `in` to the number 0 - start
				// empty, so nothing matches until something arrives.
				in: '',
				inTrigger: 0,
				rowViews: [],
			};
			_.each(rows, function(r) { attrs['c' + r.id] = 0; });
			this.model.set(attrs);
			this.applyPortLayout();
			this.updateRowViews();
		},

		onRender: function() {
			WidgetView.prototype.onRender.call(this);
			this.renderEditor();
		},

		onRemove: function() {
			if(this._pending) { clearTimeout(this._pending.timer); }
			_.each(this._pulseTimers, function(t) { clearTimeout(t); });
		},

		// A saved patch's input arriving isn't a new event - don't fire
		// on it. Its rows bring their outlets with them.
		setFromModel: function(model) {
			this._restoring = true;
			var result;
			try {
				result = WidgetView.prototype.setFromModel.call(this, model);
			} finally {
				this._restoring = false;
			}
			this._applied = [];
			this.updateRowViews();
			this.renderEditor();
			return result;
		},

		// ---- the rows and their outlets ----

		rows: function() {
			return this.model.get('rows') || [];
		},

		/**
		 * applyPortLayout - WidgetMulti's, but the outs come from the
		 * rows: one per row, in row order, each named by its test. A
		 * widget with header ports otherwise always gets the class's own
		 * (fixed) port lists.
		 */
		applyPortLayout: function() {
			var outs = _.map(this.model.get('rows') || [], function(r) {
				return {title: rowLabel(r), from: 'c' + r.id, to: 'c' + r.id, noChain: true};
			});
			this.hasHeaderPorts = true;
			this.model.set({
				ins: this.ins,
				outs: outs,
				bodyIns: _.reject(this.ins, function(p) { return p.header; }),
				bodyOuts: outs,
			});
		},

		/**
		 * setRows - the one place rows change. Rebuilds the outlets, the
		 * body and (when the change is structural) the editor, then moves
		 * this widget's cables to where their outlets now are.
		 *
		 * @param {Array} rows
		 * @param {boolean} structural rows were added, deleted or moved
		 */
		setRows: function(rows, structural) {
			// otherwise is always last: it means "none of the above".
			rows = _.filter(rows, function(r) { return r.test !== 'otherwise'; })
				.concat(_.filter(rows, function(r) { return r.test === 'otherwise'; }));
			var attrs = {rows: rows};
			_.each(rows, function(r) {
				if(this.model.get('c' + r.id) === undefined) { attrs['c' + r.id] = 0; }
			}, this);
			this.model.set(attrs);
			this.applyPortLayout();
			this.updateRowViews();
			if(structural) {
				this.renderEditor();
				// New outlet nubs need to be draggable (to start a cable).
				this.makeDraggable();
				this.relayoutCables();
			}
			this.evaluate({quiet: this.model.get('mode') === 'pulse'});
		},

		/**
		 * relayoutCables - every cable from one of this widget's outlets
		 * is drawn to where that outlet is now. A cable whose row has
		 * gone is removed (its mapping too).
		 */
		relayoutCables: function() {
			var self = this;
			var views = (window.app.Patcher && window.app.Patcher.Controller && window.app.Patcher.Controller.widgets) || [];
			_.each(views, function(view) {
				_.each((view.cables || []).slice(), function(c) {
					if(c.model !== self.model || !c.map) { return; }
					var y = self.portOffsetY(c.map.sourceField, 'outlet');
					if(y === null) {
						view.unMapInlet({target: {dataset: {field: c.map.destinationField}}});
						view.$('.inlet[data-field="' + c.map.destinationField + '"]').removeClass('connected');
						return;
					}
					if(c.offsets && c.offsets.source) {
						c.offsets.source.y = y;
						c.cable.updateCoordinates({
							from: {x: self.model.get('offsetLeft') + c.offsets.source.x, y: self.model.get('offsetTop') + y},
						});
					}
				});
			});
			// The saved mapping list keeps the same offsets objects, so the
			// next save stores the new positions - but tell the server the
			// mapping list changed when a row's cables went.
			window.app.vent.trigger('updateModelMappings', window.app.Patcher.Controller.widgetMappings);
		},

		updateRowViews: function() {
			var applied = this._applied || [];
			var movable = _.filter(this.rows(), function(r) { return r.test !== 'otherwise'; }).length;
			var never = this._never = unreachable(this.rows(), this.model.get('match'));
			// The editor isn't rebuilt while typing - mark its rows here.
			var $ed = this.$('.casesEditor');
			_.each(this.rows(), function(r) {
				var $row = $ed.find('.caseEdit[data-id="' + r.id + '"]');
				$row.toggleClass('never', !!never[r.id]).find('.caseNum').attr('title', never[r.id] || '');
				// The reason, in plain view under the row.
				var $why = $row.next('.caseWhy');
				if(never[r.id]) {
					if(!$why.length) { $why = $('<div class="caseWhy"></div>').insertAfter($row); }
					$why.text(never[r.id]);
				} else {
					$why.remove();
				}
			});
			this.model.set('rowViews', _.map(this.rows(), function(r) {
				var label = rowLabel(r);
				// otherwise stays last, and a lone row has nowhere to go:
				// no grip on those (the space stays, so labels line up).
				var fixed = r.test === 'otherwise' || movable < 2;
				return {id: r.id, label: label, fixed: fixed, matched: _.contains(applied, r.id), never: !!never[r.id],
					full: label + (never[r.id] ? ' - ' + never[r.id] : '') + ' - click to fire this row' + (fixed ? '' : ', drag to move it')};
			}));
		},

		// ---- the editor (more panel) ----

		// Built by hand rather than with rv-each: typing in a value would
		// otherwise rebuild the list under the cursor on every key.
		renderEditor: function() {
			var $ed = this.$('.casesEditor');
			if(!$ed.length) { return; }
			var rows = this.rows();
			// otherwise stays last, so it doesn't move, and nothing moves
			// below it.
			var movable = _.filter(rows, function(r) { return r.test !== 'otherwise'; }).length;
			var html = _.map(rows, function(r, i) {
				var test = TEST_BY_V[r.test] || TEST_BY_V.gt;
				var options = _.map(TESTS, function(t) {
					return '<option value="' + t.v + '"' + (t.v === r.test ? ' selected' : '') + '>' + t.label + '</option>';
				}).join('');
				var placeholder = test.kind === 'range' ? '300 700' : test.kind === 'words' ? 'hi, hello' : test.kind === 'number' ? '512' : '';
				var why = (this._never || {})[r.id];
				return '<div class="caseEdit' + (why ? ' never' : '') + '" data-id="' + r.id + '">' +
					'<span class="caseGrip' + (i >= movable || movable < 2 ? ' fixed' : '') + '" title="' + (i >= movable ? 'otherwise stays last' : 'drag to move this row') + '">&#8942;&#8942;</span>' +
					'<span class="caseNum" title="' + _.escape(why || '') + '">' + (i + 1) + '</span>' +
					'<label class="caseNotLabel" title="not: the row matches when its test does NOT"><input type="checkbox" class="caseNot"' + (r.not ? ' checked' : '') + (test.v === 'otherwise' ? ' disabled' : '') + '>not</label>' +
					'<select class="caseTest" title="the test">' + options + '</select>' +
					'<input class="caseValue" type="text" spellcheck="false" placeholder="' + placeholder + '" value="' + _.escape(r.value || '') + '"' + (test.v === 'otherwise' ? ' disabled' : '') + ' title="' + (test.kind === 'words' ? 'one or more words or phrases, separated by commas - any of them matches' : test.kind === 'range' ? 'two numbers, low and high (both included)' : 'a number (or, for =, a word)') + '">' +
					'<button type="button" class="caseDelete" title="delete this row and its cables"' + (rows.length <= 1 ? ' disabled' : '') + '>&minus;</button>' +
					'</div>' +
					(why ? '<div class="caseWhy">' + _.escape(why) + '</div>' : '');
			}, this).join('');
			$ed.html(html);
			this.$('.casesAdd').prop('disabled', rows.length >= MAX_ROWS);
		},

		rowIndex: function(e) {
			var id = parseInt($(e.currentTarget).closest('.caseEdit').attr('data-id'), 10);
			return _.findIndex ? _.findIndex(this.rows(), function(r) { return r.id === id; }) :
				_.indexOf(_.pluck(this.rows(), 'id'), id);
		},

		addRow: function(e) {
			if(e) { e.preventDefault(); }
			var rows = cloneRows(this.rows());
			if(rows.length >= MAX_ROWS) { return; }
			var id = this.model.get('nextRowId') || (_.max(_.pluck(rows, 'id').concat([0])) + 1);
			// Copy the last test that isn't otherwise, as Delft did, and
			// keep otherwise last.
			var last = rows.length ? rows[rows.length - 1] : null;
			var copyFrom = _.find(rows.slice().reverse(), function(r) { return r.test !== 'otherwise'; });
			var row = {id: id, test: copyFrom ? copyFrom.test : 'gt', value: copyFrom ? copyFrom.value : '', not: false};
			if(last && last.test === 'otherwise') { rows.splice(rows.length - 1, 0, row); }
			else { rows.push(row); }
			this.model.set('nextRowId', id + 1);
			this.setRows(rows, true);
		},

		deleteRow: function(e) {
			e.preventDefault();
			var rows = cloneRows(this.rows());
			var i = this.rowIndex(e);
			if(i < 0 || rows.length <= 1) { return; }
			var gone = rows.splice(i, 1)[0];
			this._applied = _.without(this._applied, gone.id);
			this.setRows(rows, true);
		},

		moveRow: function(i, to) {
			var rows = cloneRows(this.rows());
			if(i < 0 || to < 0 || to >= rows.length) { return; }
			var row = rows.splice(i, 1)[0];
			rows.splice(to, 0, row);
			this.setRows(rows, true);
		},

		// ---- drag to reorder ----

		// Body rows: a press that moves less than 4px is still a click
		// (fire the row). Editor rows: drag by the grip.
		onBodyRowDown: function(e) {
			if(e.which !== 1) { return; }
			e.preventDefault();   // no text selection while dragging
			this._suppressClick = false;
			this.startRowDrag(e, '.casesRows', '.caseRow', 4);
		},

		onGripDown: function(e) {
			if(e.which !== 1) { return; }
			e.preventDefault();
			this.startRowDrag(e, '.casesEditor', '.caseEdit', 0);
		},

		/**
		 * startRowDrag - the dragged row follows the pointer and a line
		 * shows where it will land; on release the row moves there
		 * (setRows moves its cables with it). otherwise stays last, so it
		 * can't be dragged and nothing can be dropped below it.
		 */
		startRowDrag: function(e, containerSel, rowSel, slop) {
			var self = this;
			var id = parseInt($(e.currentTarget).closest(rowSel).attr('data-id'), 10);
			var ids = _.pluck(this.rows(), 'id');
			var from = _.indexOf(ids, id);
			var movable = _.filter(this.rows(), function(r) { return r.test !== 'otherwise'; }).length;
			if(from < 0 || from >= movable || movable < 2) { return; }

			var startY = e.pageY, dragging = false, to = from;
			// Re-query each time: an input arriving mid-drag can re-render
			// the body rows.
			var items = function() { return self.$(containerSel + ' ' + rowSel); };
			var $first = items().filter('[data-id="' + id + '"]');
			var pitch = $first.outerHeight(true) || 26;   // rows are all one height
			var clear = function() {
				items().removeClass('dragging shifting').css('transform', '');
				self.$el.removeClass('casesDragging');
			};

			$(document).on('mousemove.casesDrag', function(ev) {
				var dy = ev.pageY - startY;
				if(!dragging) {
					if(Math.abs(dy) < slop) { return; }
					dragging = true;
					self.$el.addClass('casesDragging');
				}
				ev.preventDefault();
				// Stay among the movable rows: not above the first, not
				// below otherwise.
				dy = Math.max(-from * pitch, Math.min((movable - 1 - from) * pitch, dy));
				to = from + Math.round(dy / pitch);
				// The dragged row follows the pointer; the rows it passes
				// slide over to make room.
				items().each(function(k) {
					var $r = $(this);
					if(parseInt($r.attr('data-id'), 10) === id) {
						$r.addClass('dragging').css('transform', 'translateY(' + dy + 'px)');
						return;
					}
					var shift = (k > from && k <= to) ? -pitch : (k >= to && k < from) ? pitch : 0;
					$r.addClass('shifting').css('transform', shift ? 'translateY(' + shift + 'px)' : '');
				});
			});
			$(document).on('mouseup.casesDrag', function() {
				$(document).off('.casesDrag');
				clear();
				if(!dragging) { return; }
				self._suppressClick = true;   // the release isn't a click
				if(to !== from) { self.moveRow(from, to); }
			});
		},

		onTestChange: function(e) {
			var rows = cloneRows(this.rows());
			var i = this.rowIndex(e);
			if(i < 0) { return; }
			rows[i].test = e.currentTarget.value;
			// Placeholder, the disabled state and the not box follow the test.
			this.setRows(rows, true);
		},

		onValueInput: function(e) {
			var rows = cloneRows(this.rows());
			var i = this.rowIndex(e);
			if(i < 0) { return; }
			rows[i].value = e.currentTarget.value;
			this.setRows(rows, false);
		},

		onNotChange: function(e) {
			var rows = cloneRows(this.rows());
			var i = this.rowIndex(e);
			if(i < 0) { return; }
			rows[i].not = e.currentTarget.checked;
			this.setRows(rows, false);
		},

		// ---- testing ----

		onInputTyped: function(e) {
			this.model.set('in', e.currentTarget.value);
		},

		triggerWired: function() {
			return _.some(this.sources, function(source) { return source.map && source.map.destinationField === 'inTrigger'; });
		},

		/**
		 * matchingIds - the rows that match the input now. otherwise
		 * matches when no row above it did. With "first match only", only
		 * the first matching row counts.
		 */
		matchingIds: function(input) {
			// Nothing to test yet (or the box was cleared): no row,
			// not even otherwise.
			if(input === undefined || input === null || String(input).trim() === '') { return []; }
			var firstOnly = this.model.get('match') !== 'all';
			var ids = [], anyAbove = false;
			_.each(this.rows(), function(r) {
				var m;
				if(r.test === 'otherwise') { m = !anyAbove; }
				else { m = testRow(r, input); }
				if(m) {
					if(!firstOnly || !anyAbove) { ids.push(r.id); }
					anyAbove = true;
				}
			});
			return ids;
		},

		/**
		 * evaluate - test the input against the rows and, after any hold,
		 * send the result on the outlets. `quiet`: update which rows show
		 * as matching without sending pulses (editing a row in pulse mode
		 * shouldn't start a Scene).
		 */
		evaluate: function(opts) {
			opts = opts || {};
			var input = this.model.get('in');
			var ids = this.matchingIds(input);
			var key = ids.join(',');
			var hold = parseInt(this.model.get('hold'), 10);
			if(isNaN(hold) || hold < 0) { hold = 0; }

			if(this._pending) {
				if(this._pending.key === key && !opts.fresh) { return; }
				clearTimeout(this._pending.timer);
				this._pending = null;
			}
			if(!opts.fresh && key === this._applied.join(',')) {
				// Pass-through still follows the input within the same rows.
				if(this.model.get('mode') === 'pass') { this.apply(ids, opts); }
				return;
			}
			if(hold > 0 && !opts.quiet) {
				var self = this;
				this._pending = {key: key, timer: setTimeout(function() {
					self._pending = null;
					self.apply(self.matchingIds(self.model.get('in')), opts);
				}, hold)};
				return;
			}
			this.apply(ids, opts);
		},

		/**
		 * apply - put a set of matching rows on the outlets.
		 *   on/off: 1023 for matching rows, 0 for the rest.
		 *   pulse:  1023 for PULSE_MS on rows that have just started
		 *           matching (every matching row, with opts.fresh).
		 *   pass:   matching rows send the input value; the rest keep theirs.
		 */
		apply: function(ids, opts) {
			opts = opts || {};
			var mode = this.model.get('mode');
			var before = this._applied || [];
			var input = this.model.get('in');
			var attrs = {};
			this._applied = ids.slice();
			_.each(this.rows(), function(r) {
				var on = _.contains(ids, r.id);
				var field = 'c' + r.id;
				if(mode === 'pulse') {
					if(on && !opts.quiet && (opts.fresh || !_.contains(before, r.id))) { this.pulseRow(r.id); }
				} else if(mode === 'pass') {
					if(on) { attrs[field] = isNumber(input) ? parseFloat(input) : input; }
				} else {
					attrs[field] = on ? 1023 : 0;
				}
			}, this);
			if(!_.isEmpty(attrs)) { this.model.set(attrs); }
			this.updateRowViews();
		},

		pulseRow: function(id) {
			var self = this, field = 'c' + id;
			clearTimeout(this._pulseTimers[id]);
			this.model.set(field, 1023);
			this._pulseTimers[id] = setTimeout(function() { self.model.set(field, 0); }, PULSE_MS);
		},

		// Click a row to fire it as if it alone had matched - for trying
		// the rest of a patch without the real input.
		onRowClick: function(e) {
			if(this._suppressClick) { this._suppressClick = false; return; }
			var id = parseInt($(e.currentTarget).attr('data-id'), 10);
			if(isNaN(id)) { return; }
			if(this._pending) { clearTimeout(this._pending.timer); this._pending = null; }
			this.apply([id], {fresh: true});
		},

		onModelChange: function(model, options) {
			var changed = model.changedAttributes();
			if(!changed || this._restoring) { return; }

			// trigger rising: test the current input once, as a new event
			// (pulse mode pulses the matching rows even if they matched
			// before). Compared with the last value handled - a nested
			// set() re-reports the same change (CLAUDE.md) - and only from
			// a cable (updateNoTrigger), not a loading patch.
			if(changed.inTrigger !== undefined && options && options.updateNoTrigger) {
				var trig = parseFloat(this.model.get('inTrigger')) || 0;
				var level = parseFloat(this.model.get('threshold'));
				if(isNaN(level)) { level = 512; }
				var rose = this._lastTrigger < level && trig >= level;
				this._lastTrigger = trig;
				if(rose) { this.evaluate({fresh: true}); }
			}

			if(changed.in !== undefined) {
				var input = this.model.get('in');
				if(input !== this._lastInput) {
					this._lastInput = input;
					// With trigger wired, trigger says when to test.
					if(!this.triggerWired()) { this.evaluate(); }
				}
			}

			if(changed.match !== undefined || changed.mode !== undefined) {
				// Start the new mode from nothing sent: on/off's 1023s
				// would otherwise stay on in pulse mode.
				if(changed.mode !== undefined) {
					var zero = {};
					_.each(this.rows(), function(r) { zero['c' + r.id] = 0; });
					this.model.set(zero);
				}
				this._applied = [];
				this.evaluate({quiet: true});
				// Rows hidden by earlier ones only matter for first-match.
				if(changed.match !== undefined) { this.updateRowViews(); }
			}
		},
	});
});
