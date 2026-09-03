// Blank widget: copy this whole folder as a starting point for a new
// widget (rename the folder/file/typeID/className to your own name, and
// register the new path in views/WidgetMap.js so it can load).
//
// This file already has a small working example wired end to end: an
// "in" inlet feeds the "limitRange" function below (registered as a
// signalChainFunction), which produces the "out" outlet. Use that
// in -> function -> out shape as your template for your own logic;
// nothing about it needs to change just to make a new widget.
//
// IMPORTANT: don't add a styles.scss file next to this one for your
// widget's CSS - per-widget styles.scss files are never loaded by the
// build (app/styles/main.scss only imports Widget.scss). Add your CSS
// directly to app/styles/Widget.scss instead, under a
// ".yourwidgetclassname { }" block (see CLAUDE.md's "Widget CSS layout"
// section, and e.g. the existing ".gesture"/".posetrack" blocks there
// for the pattern to follow).
define([
	'backbone',
    'rivets',
	'views/item/WidgetMulti',
	'text!./template.js',

	// If you would like signal processing classes and functions include them here
	'utils/SignalChainFunctions',
	'utils/SignalChainClasses',
	// and any other imported libraries you like should go here
    'jqueryknob',
	'utils/utils'
],
function(Backbone, rivets, WidgetView, Template, SignalChainFunctions, SignalChainClasses, jqueryknob, utils){
    'use strict';

	return WidgetView.extend({
		// Define the inlets
		ins: [
			// title is decorative, to: <widget model field being set by inlet>
			{title: 'in', to: 'in'},
		],
		outs: [
			// title is decorative, from: <widget model field>, to: <widget model field being listened to>
			{title: 'out', from: 'in', to: 'out'},
		],
        // Any custom DOM events should go here (Backbone style)
        widgetEvents: {},
		// typeID us the unique ID for this widget. It must be a unique name as these are global.
		typeID: 'Blank',
		className: 'blank',
		// IMPORTANT: this widget is left OUT of the Add Widgets panel on
		// purpose (categories left commented out below) since "Blank" is
		// just a copy-paste starting point, not a real widget. Once you
		// rename/typeID this into your own widget, UNCOMMENT and set
		// this to a real category array or your widget will NEVER show
		// up in the panel - ToolBar.js's sortWidgetCategories() skips any
		// widget whose categories array is empty/missing. Existing
		// categories (see app/styles/toolBar.scss for their swatch
		// colors): 'I/O', 'network', 'media', 'generator', 'logic', 'UI',
		// 'AI'. You can also invent a brand new category name - it gets
		// its own section in the panel automatically (data-driven),
		// though it'll have no special swatch color until you add one in
		// toolBar.scss (search for .catAI/.widgetAI there for the pattern).
		//categories: ['other'],
		template: _.template(Template),

		initialize: function(options) {
			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);

            // Call any custom DOM events here
            this.model.set({
                title: 'Blank',
                limit: true,
                // A tuning value like this - not something you'd touch
                // every time you use the widget - belongs in the "more"
                // panel (see template.js's .widgetBottom .content) rather
                // than in the compact main body. See limitRange() below,
                // which reads this instead of a hardcoded number.
                limitCeiling: 512,
            });

            // If you want to register your own signal processing function, push them to signalChainFunctions
			this.signalChainFunctions.push(this.limitRange);

			// Likewise, if you need to register an instance-based processor
			//this.smoother = new SignalChainClasses.Smoother({tolerance: 50});
			//this.signalChainFunctions.push(this.smoother.getChainFunction());

			// If you would like to register any function to be called at frame rate (60fps)
            /*
			this.localTimeKeeperFunc = function(frameCount) {
				this.timeKeeper(frameCount);
			}.bind(this);

			window.app.timingController.registerFrameCallback(this.localTimeKeeperFunc, this);
            */
		},

        /**
         * Called when widget is rendered
		 * Most of your custom binding and functionality will happen here
         *
         * @return {void}
         */
        onRender: function() {
			var self = this;

			// IMPORTANT: any custom rivets.binders.*/rivets.formatters.*
			// used by this widget's own template.js (like the "knob"
			// binder below, used via rv-knob="widget:in" in template.js)
			// MUST be registered BEFORE calling
			// WidgetView.prototype.onRender.call(this) - that base call is
			// what performs rivets' actual bind pass, resolving every
			// rv-* binder at that moment. Register after it and the
			// binding is silently never wired up.
			rivets.binders.knob = function(el, value) {
				el.value = value;
				$(el).val(value);
				$(el).trigger('change');
			};

			// always call the superclass
            WidgetView.prototype.onRender.call(this);

			this.$('.dial').knob({
				'fgColor':'#000000',
				'bgColor':'#ffffff',
				'inputColor' : '#000000',
				'angleOffset':-125,
				'angleArc':250,
				'width':80,
				'height':62,
				'font':"'Helvetica Neue', sans-serif",
				'displayInput':false,
				'min': 0,
				'max': 1023,
				'change' : function (v) { self.model.set('in', parseInt(v)); }
			});
        },

		// Override this to react to any model field changing (e.g. to
		// drive imperative UI updates that a declarative rv-* binding in
		// template.js can't express). Prefer rv-class-<name>/rv-show/etc.
		// bindings over this where possible - they're easier to verify
		// and don't depend on listener ordering (see CLAUDE.md).
        // onModelChange: function(model) {
        //     var diff = model.changedAttributes();
        // },

		// Any custom function can be attached to the widget like this "limitServoRange" function
		// and can be accessed via this.limitServoRange();
        limitRange: function(input) {
            var output = input;
            output = Math.max(output, 0);
            if (this.model.get('limit')) {
                // parseInt: the "more" panel's rv-value input always
                // hands back a string (see CLAUDE.md), so this must be
                // parsed before use, not just compared/subtracted.
                output = Math.min(output, parseInt(this.model.get('limitCeiling'), 10));
            }
            return Number(output);
        },

	});
});
