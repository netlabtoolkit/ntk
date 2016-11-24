define([
	'backbone',
    'rivets',
	'views/item/WidgetMulti',
	'text!./template.js',
    'jqueryknob',

],
function(Backbone, rivets, WidgetView, Template, jqueryknob){
	'use strict';

	return WidgetView.extend({
		typeID: 'AnalogOut',
		deviceMode: 'PWM',
		categories: ['I/O'],
		className: 'analogOut',
		template: _.template(Template),

		ins: [
			{title: 'input', to: 'in'},
		],
		outs: [
			{title: 'output', from: 'in', to: 'out'},
		],
		sources: [],
		initialize: function(options) {
			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);
			this.model.set({
				title: 'AnalogOut',
				outputMapping: options.outputMapping,
                activeOut: true,
			});

            this.signalChainFunctions.push(this.limitRange);

			// This is here because this widget effectively does not output (only outputs to hardware and then, only on server)
			// So we go ahead and process so the output can be shown in the widget
			//if(!app.server) {
				this.model.on('change', this.processSignalChain, this);
			//}

		},

		onModelChange: function(model) {
			for(var i=this.sources.length-1; i>=0; i--) {
				this.syncWithSource(this.sources[i].model);
			}

			var changed = model.changedAttributes();

			if(changed) {
				if(changed.server) {
					this.model.set('server', changed.server);
				}
				if(changed.port) {
					this.model.set('port', changed.port);
				}

				if(changed.deviceType) {
					this.model.set('deviceType', changed.deviceType);
				}

				if( changed.deviceType || changed.server || changed.port) {
					var sourceField = this.sources[0] !== undefined ? this.sources[0].map.sourceField : this.model.get('inputMapping'),
						modelType = this.model.get('deviceType') === undefined ? 'ArduinoUno' : this.model.get('deviceType');

					var server = this.model.get('server') == undefined ? 'localhost' : this.model.get('server');
					var port = this.model.get('port') == undefined ? 9001 : this.model.get('port');

					app.Patcher.Controller.mapToModel({
						view: this,
						modelType: modelType,
						IOMapping: {sourceField: "out", destinationField: 'D3'},
						server: server + ":" + port,
					}, true);
				}
			}
		},
        onRender: function() {
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
				'max': 255,
				'change' : function (v) { this.model.set('in', parseInt(v)); }.bind(this)
			});

			rivets.binders.knob = function(el, value) {
				el.value = value;
				$(el).val(value);
				$(el).trigger('change');
			};
        },

        limitRange: function(input) {
            var output = input;
            output = Math.max(output, 0);
            output = Math.min(output, 255);
            return Number(output);
        },
	});
});
