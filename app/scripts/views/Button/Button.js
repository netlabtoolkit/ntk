define([
	'backbone',
    'rivets',
	'views/item/WidgetMulti',
	'text!./template.js',

	// If you would like signal processing classes and functions include them here
	'utils/SignalChainFunctions',
	'utils/SignalChainClasses',
	// and any other imported libraries you like should go here
],
function(Backbone, rivets, WidgetView, Template, SignalChainFunctions, SignalChainClasses){
    'use strict';

	return WidgetView.extend({
		// Define the inlets
		ins: [
			// title is decorative, to: <widget model field being set by inlet>
			//{title: 'in', to: 'in'},
		],
		outs: [
			// title is decorative, from: <widget model field>, to: <widget model field being listened to>
			{title: 'out', from: 'in', to: 'out'},
		],
        // Any custom DOM events should go here (Backbone style)
        widgetEvents: {
			'mouseup .dragKnob': 'imgMoved',
		},
		// typeID us the unique ID for this widget. It must be a unique name as these are global.
		typeID: 'Button',
		className: 'button',
		template: _.template(Template),

		initialize: function(options) {
			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);

            // Call any custom DOM events here
            this.model.set({
                title: 'Button',
                activeControlParameter: 'left',
                controlParameters: [
                    {
                        name: 'X',
                        parameter: 'left',
                    },
                    {
                        name: 'Y',
                        parameter: 'top',
                    },
                    {
                        name: 'opacity',
                        parameter: 'opacity',
                    },
                ],
                left: 100,
                top: 200,
                opacity: 100,
            });
            
            //this.signalChainFunctions.push(SignalChainFunctions.scale);
            
            this.model.set('in', this.model.get('outputFloor'));

            // If you want to register your own signal processing function, push them to signalChainFunctions
			//this.signalChainFunctions.push(this.limitRange);

			// Likewise, if you need to register an instance-based processor
			//this.smoother = new SignalChainClasses.Smoother({tolerance: 50});
			//this.signalChainFunctions.push(this.smoother.getChainFunction());

			// If you would like to register any function to be called at frame rate (60fps)
			//window.app.timingController.registerFrameCallback(this.processSignalChain, this);
		},

        /**
         * Called when widget is rendered
		 * Most of your custom binding and functionality will happen here
         *
         * @return {void}
         */
        onRender: function() {
			// always call the superclass
            WidgetView.prototype.onRender.call(this);

            var self = this;

			this.$( "#theButton" ).button({
              label: "Button"
            });
            
            //this.$( "#theButton" ).css('height','200px');
            
            this.$( "#theButton" ).mousedown(function() {
                self.model.set('in', parseInt(self.model.get('outputCeiling'),10));
            });
            this.$( "#theButton" ).mouseup(function() {
                self.model.set('in', parseInt(self.model.get('outputFloor'),10));
            });

            this.$( "#theButton" ).on('touchstart',function() {
                self.model.set('in', parseInt(self.model.get('outputCeiling'),10));
            });
            
            this.$( "#theButton" ).on('touchend',function() {
                self.model.set('in', parseInt(self.model.get('outputFloor'),10));
            });
                
            this.$( "#theButton" ).on('touchcancel',function() {
                self.model.set('in', parseInt(self.model.get('outputFloor'),10));
            });
            
            
            if(!app.server) {
                this.$( '.detachedEl' ).css( 'position', 'fixed' );
                this.$( '.detachedEl' ).draggable({ 
                    cursor: 'move',
                    handle: '.dragKnob',
                });
                this.$( '.dragKnob' ).css( 'cursor', 'move' );
            }
        },


		// Any custom function can be attached to the widget like this "limitServoRange" function
		// and can be accessed via this.limitServoRange();

        imgMoved: function(e) {
            var offset = this.$('.detachedEl').offset();
            this.model.set('left',offset.left);
            this.model.set('top',offset.top);
        },

	});
    

});
