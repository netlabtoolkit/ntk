define([
	'backbone',
	'views/item/WidgetMulti',
	'text!./template.js',

	'codemirror',
],
function(Backbone, WidgetView, Template, CodeMirror){
    'use strict';

	return WidgetView.extend({
		// Map inputs to model
		ins: [
			// title: decorative, to: <widget model field>
			{title: 'one', to: 'in1'},
			{title: 'two', to: 'in2'},
		],
		outs: [
			// title: decorative, from: <widget model field>, to: <widget model field being listened to>
			{title: 'out', from: 'output', to: 'out1'},
		],
		//defaults: {
				//filter: "return inputs.inOne + inputs.inTwo;",
				//inOne: 2,
				//inTwo: 3,
				//outOne: 1,
		//},
		sources: [],
		typeID: 'Code',
		className: 'code',
		template: _.template(Template),

		initialize: function(options) {
			if(!options) {
				options = {};
			}
			_.extend(options, {
				filter: "return inputs.in1 + inputs.in2;",
				in1: 0,
				in2: 0,
				out1: 0,
			});
			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);
			this.model.set('title', 'Code');

		},
        /**
         * called when widget is rendered
         *
         * @return
         */
		onRender: function() {
			WidgetView.prototype.onRender.call(this);

            var self = this;

			this.registerFilters();


			var codeEditor = CodeMirror.fromTextArea(this.$('.filterFunction')[0], {
				lineNumbers: true,
				smartIndent: true,
				mode: "javascript",
			});

			codeEditor.on('blur', function() {
				self.model.set('filter', codeEditor.getValue());
				self.registerFilters.apply(self);
			});

		},
		registerFilters: function() {
			this.signalChainFunctions.length = 0;
			this.signalChainFunctions.push(new Function("var inputs = arguments[1]; " + this.model.get('filter')));
		},
	});
});
