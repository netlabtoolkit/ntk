define([
	'backbone',
    'rivets',
	'views/item/WidgetMulti',
	'text!./template.js',

	'utils/SignalChainFunctions',
	'utils/SignalChainClasses',
],
function(Backbone, rivets, WidgetView, Template, SignalChainFunctions, SignalChainClasses){
    'use strict';

	return WidgetView.extend({
		// Define the inlets
		ins: [
		],
		outs: [
			// title is decorative, from: <widget model field>, to: <widget model field being listened to>
			{title: 'out', from: 'in', to: 'out'},
		],
        // Any custom DOM events should go here (Backbone style)
        widgetEvents: {},
		// typeID us the unique ID for this widget. It must be a unique name as these are global.
		typeID: 'OSCIn',
		deviceMode: 'in',
		className: 'oscIn',
		categories: ['Network'],
		template: _.template(Template),

		initialize: function(options) {
			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);

            // Call any custom DOM events here
			this.model.set({
				title: 'OSCIn',
				messageName: '/ntk/in/1',
			});

            this.signalChainFunctions.push(SignalChainFunctions.scale);

            // Register the signal chain to be updated at frame rate
			window.app.timingController.registerFrameCallback(this.processSignalChain, this);

			this.model.on('change', function(model) {
				var changed = model.changedAttributes();

				if(changed.messageName !== undefined) {

					   for(var i=this.sources.length-1; i>=0; i--) {
						   var source = model.get('messageName');
						   this.sources[i].map.sourceField = source;
						   model.set('outputMapping', source);
					   }
			   }
			}, this);

			window.setTimeout(function() {
				window.app.vent.trigger('Widget:hardwareSwitch', {deviceType: 'OSC', mode: 'in', port: this.model.get('outputMapping') });
			}.bind(this), 200);
		},
		onRender: function() {
			WidgetView.prototype.onRender.call(this);
			var self = this;

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
				'change' : function (v) { this.model.set('in', parseInt(v)); }.bind(this)
			});


			rivets.binders.knob = function(el, value) {
				el.value = value;
				$(el).val(value);
				$(el).trigger('change');
			};


		},
		onModelChange: function onModelChange(model) {
			var outputMapping = model.changedAttributes().outputMapping;

			for(var i=this.sources.length-1; i>=0; i--) {
				this.syncWithSource(this.sources[i].model);
			}

			if(outputMapping) {
				// If a change has occurred make sure to send the change along to the server so we can switch pin modes if needed
				// Do this for all sources and include the address of the source
				for(var i=this.sources.length-1; i>=0; i--) {
					for(var port in outputMapping) {
						window.app.vent.trigger('Widget:hardwareSwitch', {deviceType: this.sources[i].model.get('type'), port: port, mode: this.deviceMode} );
					}
				}
			}
		},

	});
});
