define([
	'backbone',
	'views/item/Widget',
	'text!tmpl/CustomFilter_tmpl.js',

	'codemirror',
],
function(Backbone, WidgetView, Template, CodeMirror){
    'use strict';

	return WidgetView.extend({
		className: 'customFilter',
		template: _.template(Template),

		initialize: function(options) {
			if(!options) {
				options = {};
			}
			_.extend(options, {
				filter: "return Math.pow(input, 2);",
			});
			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);
			this.model.set('title', 'Expression');

			//this.listenTo(this.model, 'change', this.registerFilters);
		},
        /**
         * called when widget is rendered
         *
         * @return
         */
		onRender: function() {
			WidgetView.prototype.onRender.call(this);

			var self = this;
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
			this.signalChainFunctions.push(new Function("var input = arguments[0]; " + this.model.get('filter')));
		},
	});
});
