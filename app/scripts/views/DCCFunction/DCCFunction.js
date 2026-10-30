define([
	'backbone',
	'rivets',
	'views/item/WidgetMulti',
	'text!./template.js',
	'utils/DccLoco',
],
function(Backbone, rivets, WidgetView, Template, DccLoco){
	'use strict';

	// One function (headlight, horn, a sound) of one loco on a DCC
	// command station - the lights / sounds half of a throttle, one
	// widget per button. Shares the station session and the loco with
	// any DCC Throttle on the same loco (see utils/DccLoco.js).

	function toNumber(value, fallback) {
		var n = parseFloat(value);
		return isNaN(n) ? fallback : n;
	}

	return WidgetView.extend(_.extend({}, DccLoco, {
		widgetEvents: {
			'click .dccFnButton': 'buttonClicked',
			'click .dccStatus': 'dccStatusClicked',
		},
		ins: [
			{title: 'in (follow: on while high; toggle: switches on rising)', to: 'in'},
		],
		outs: [
			{title: 'state (1 on, 0 off, as the station reports it)', from: 'state', to: 'state'},
		],
		typeID: 'DCCFunction',
		className: 'dccFunction dccWidget',
		categories: ['network'],
		template: _.template(Template),

		initialize: function(options) {
			WidgetView.prototype.initialize.call(this, options);

			// Read by onModelChange, which the set() calls below fire -
			// must exist first (see CLAUDE.md's Rivets/Backbone gotchas).
			this.lastIn = undefined;
			this.initDcc();

			var get = this.model.get.bind(this.model);
			this.model.set({
				title: 'DCC Func',
				fn: get('fn') === undefined ? 0 : get('fn'),
				toggle: get('toggle') === undefined ? false : get('toggle'),
				in: '--',
				state: 0,
				// Display only.
				fnOn: false,
				fnStateText: 'off',
				fnLabel: 'F0',
			});
			this.updateLabel();
		},

		onRender: function() {
			// Must be registered before WidgetView.prototype.onRender -
			// see CLAUDE.md's Rivets/Backbone gotcha.
			this.dccRegisterFormatters(rivets);
			WidgetView.prototype.onRender.call(this);
		},

		onRemove: function() {
			this.removeDcc();
		},

		getFunctionNumber: function() {
			var fn = parseInt(this.model.get('fn'), 10);
			return fn >= 0 && fn <= 68 ? fn : null;
		},

		updateLabel: function() {
			var fn = this.getFunctionNumber();
			this.model.set('fnLabel', fn === null ? 'F?' : 'F' + fn);
		},

		setFunction: function(on) {
			var fn = this.getFunctionNumber();
			if(fn === null) { return; }
			this.sendToLoco('f' + fn, on ? 1 : 0);
		},

		// Stands in for a hardware button, so a patch can be tried with
		// nothing wired in.
		buttonClicked: function(e) {
			e.preventDefault();
			this.setFunction(!this.model.get('fnOn'));
		},

		onLocoReport: function(what, value) {
			if(what !== 'f' + this.getFunctionNumber()) { return; }
			this.showState(value ? 1 : 0);
		},

		showState: function(state) {
			this.model.set({state: state, fnOn: state === 1, fnStateText: state === 1 ? 'on' : 'off'});
		},

		onModelChange: function(model, options) {
			var changed = model.changedAttributes();
			if(!changed) { return; }

			// A new loco or function number: the state shown was the old
			// one's, until the station reports the new one.
			if(this.dccSettingsChanged(changed) || changed.fn !== undefined) {
				this.updateLabel();
				this.showState(0);
				if(changed.fn !== undefined && this.acquired) {
					// The station only reports a function when it changes,
					// so ask for the loco again to hear its current state.
					this.enableDevice();
				}
			}

			// See DCCThrottle.js - only values that arrive through a cable.
			if(!(options && options.updateNoTrigger) || changed.in === undefined) { return; }

			var value = toNumber(changed.in, 0), last = this.lastIn;
			this.lastIn = value;
			if(this.model.get('toggle')) {
				if(value > 0.5 && !(last > 0.5)) { this.setFunction(!this.model.get('fnOn')); }
			}
			else if((value > 0.5) !== (last > 0.5)) {
				this.setFunction(value > 0.5);
			}
		},

		setFromModel: function(model) {
			this.dccSetFromModel(model);
			this.updateLabel();
			this.showState(0);
			return this;
		},
	}));
});
