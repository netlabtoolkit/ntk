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
			{title: 'in1', to: 'in1'},
			{title: 'in2', to: 'in2'},
            {title: 'in3', to: 'in3'},
			{title: 'in4', to: 'in4'},
		],
		outs: [
			// title: decorative, from: <widget model field>, to: <widget model field being listened to>
			{title: 'out1', from: 'output', to: 'out1'},
			{title: 'out2', from: 'output2', to: 'out2'},
			{title: 'out3', from: 'output3', to: 'out3'},
			{title: 'out4', from: 'output4', to: 'out4'},
		],
		sources: [],
		typeID: 'Code',
		className: 'code',
        categories: ['logic'],
		template: _.template(Template),

		initialize: function(options) {
			if(!options) {
				options = {};
			}
            
            var code =  '// Enter your Javascript here to process inputs and return the outputs\n' +
            '// The four input values are in an array called "ins" as\n' + 
            '// ins.in1, ins.in2, ins.in3, ins.in4\n' +
            '//\n' +
            '// The four output values are returned as an array with four elements\n' +
            '//\n' +
            'var out1 = ins.in1 + ins.in2;\n' +
            'var out2 = ins.in2;\n' +
            'var out3 = ins.in3;\n' +
            'var out4 = ins.in4;\n' +
            '\n' +
            'return [ out1, out2, out3, out4 ];';
            
			_.extend(options, {
				filter: code,
				in1: 0,
				in2: 0,
                in3: 0,
				in4: 0,
				out1: 0,
				out2: 0,
			});
			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);
			this.model.set('title', 'Code');

			// Re-register the filter function after a change. Filter is interpreted once and converted to a function so it has to be re-evaluated
			this.model.on('change', function(model) {
				if(model.changedAttributes().filter) {
					this.registerFilters();
				}
			}, this);

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

            this.$( ".widgetBottom .tab" ).click(function() {
                // ensure the code is visible
                codeEditor.refresh();
            });
		},

		onModelChange: function onModelChange(model) {
			var codeFunction = new Function("var ins = arguments[0]; " + this.model.get('filter'));

			var result = codeFunction({in1: this.model.get('in1'), in2: this.model.get('in2'), in3: this.model.get('in3'), in4: this.model.get('in4')} );

			if(result !== undefined) {
				if( result instanceof Array) {

					for(var i=this.outs.length-1; i>=0; i--) {
						this.model.set(this.outs[i].from, result[i]);
					}
				}
				else {
					this.model.set('output', result);
				}
			}
		},
		registerFilters: function() {
			//this.signalChainFunctions.length = 0;
			//this.signalChainFunctions.push(new Function("var ins = arguments[1]; " + this.model.get('filter')));
		},
	});
});
