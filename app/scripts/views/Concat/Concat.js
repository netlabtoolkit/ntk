define([
	'backbone',
	'rivets',
	'views/item/WidgetMulti',
	'text!./template.js',
],
function(Backbone, rivets, WidgetView, Template){
	'use strict';

	return WidgetView.extend({
		typeID: 'Concat',
		className: 'concat',
		categories: ['logic'],
		template: _.template(Template),
		sources: [],

		ins: [
			{title: 'a', to: 'in1'},
			{title: 'b', to: 'in2'},
			{title: 'c', to: 'in3'},
			{title: 'd', to: 'in4'},
		],
		outs: [
			{title: 'out', from: 'out1', to: 'out1'},
		],

		widgetEvents: {
			// rivets 0.6.10's value binder only publishes on 'change'
			// (blur) - push separator edits to the model live instead.
			'input .separator': 'onSeparatorInput',
		},

		onSeparatorInput: function(e) {
			this.model.set('separator', e.currentTarget.value);
		},

		initialize: function(options) {
			WidgetView.prototype.initialize.call(this, options);

			this.model.set({
				title: 'Concat',
				in1: '',
				in2: '',
				in3: '',
				in4: '',
				// Text between each value. Default comma + space; clear it
				// for no separator at all.
				separator: ', ',
				out1: '',
			});
			// The model.set above fires onModelChange synchronously, which
			// runs rebuild() - no explicit first call needed.
		},

		onModelChange: function(model) {
			var c = model.changedAttributes();
			if(!c) { return; }
			// Recompute the output on ANY model change - an input arriving
			// on a-d, the separator being edited, etc. The one thing that
			// must NOT re-trigger is our own write to out1 (that would be a
			// pointless second pass), so skip when out1 is all that moved.
			if(_.keys(c).length === 1 && c.out1 !== undefined) { return; }
			this.rebuild();
		},

		// Connecting a cable only binds syncWithSource to the source's
		// *future* changes - the value already sitting on the source is
		// never pushed. Pull it now so a freshly wired input shows up in
		// the output immediately instead of only after it next changes.
		addInputMap: function(map) {
			WidgetView.prototype.addInputMap.call(this, map);
			if(map && map.model) {
				this.syncWithSource(map.model);
			}
			this.rebuild();
		},

		// Disconnecting a cable doesn't clear the model field it was
		// feeding (the last value just sits there) and doesn't fire a
		// model 'change', so hook both removal paths and recompute. The
		// base unMapInlet handles the click-the-x case; removeMapping
		// (bound to the 'Widget:removeMapping' vent) covers a source
		// widget being deleted.
		unMapInlet: function(e, ui, draggable) {
			WidgetView.prototype.unMapInlet.call(this, e, ui, draggable);
			this.rebuild();
		},

		removeMapping: function(source, modelWID) {
			WidgetView.prototype.removeMapping.call(this, source, modelWID);
			this.rebuild();
		},

		// Join the four inputs with the separator. Only inlets that
		// currently have a live cable contribute - so a disconnected
		// input drops out of the result even though its last value is
		// still in the model. Inputs may be strings or numbers; numbers
		// are stringified as-is (512.5 -> "512.5", 0 -> "0"). Empty
		// strings are skipped, so wiring only a and c gives "a, c".
		rebuild: function() {
			var sep = this.model.get('separator');
			if(sep == null) { sep = ''; }

			var connected = {};
			_.each(this.sources || [], function(s) {
				if(s && s.map) { connected[s.map.destinationField] = true; }
			});

			var parts = [];
			for(var i = 1; i <= 4; i++) {
				var key = 'in' + i;
				if(!connected[key]) { continue; }
				var v = this.model.get(key);
				if(v != null && String(v) !== '') {
					parts.push(String(v));
				}
			}

			this.model.set('out1', parts.join(sep));
		},

	});
});
