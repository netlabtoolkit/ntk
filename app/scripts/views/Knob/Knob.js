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
],
function(Backbone, rivets, WidgetView, Template, SignalChainFunctions, SignalChainClasses, jqueryknob){
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
		typeID: 'Knob',
		categories: ['UI'],
		className: 'knob',
		template: _.template(Template),

		initialize: function(options) {
			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);

            // Call any custom DOM events here
            this.model.set({
                title: 'Knob',
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
            
            this.signalChainFunctions.push(SignalChainFunctions.scale);

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
            
            //if(!app.server) {
                this.$( '.detachedEl' ).css( 'position', 'fixed' );
                this.$( '.detachedEl' ).draggable({ 
                    cursor: 'move',
                    handle: '.dragKnob',
                });
                this.$( '.dragKnob' ).css( 'cursor', 'move' );
            //}

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

            
            this.$('.knob').knob({
				'fgColor':'#000000',
				'bgColor':'#ffffff',
				'inputColor' : '#000000',
				'angleOffset':-125,
				'angleArc':250,
				'width':200,
				'height':160,
				'font':"'Helvetica Neue', sans-serif",
				'displayInput':false,
				'min': 0,
				'max': 1023,
				'change' : function (v) { 
                    self.model.set('in', parseInt(v)); 
                    self.$('.dial').val(parseInt(v)).trigger('change');
                }
			});

			rivets.binders.knob = function(el, value) {
				el.value = value;
				$(el).val(parseInt(value));
				$(el).trigger('change');
			};
            

        },
        
        imgMoved: function(e) {
            // position:fixed box - read raw css left/top (round-trips with
            // the rv-positionx/y binders); .offset() adds page scroll and
            // drifts the box on every move (the old "- 5" fudge was
            // masking part of that). Clamp so it stays reachable.
            var $box = this.$('.detachedEl');
            var left = parseInt($box.css('left'), 10) || 0;
            var top = parseInt($box.css('top'), 10) || 0;
            left = Math.max(0, Math.min(left, (window.innerWidth || 1200) - 60));
            top = Math.max(0, Math.min(top, (window.innerHeight || 800) - 40));
            $box.css({ left: left + 'px', top: top + 'px' });
            this.model.set('left', left);
            this.model.set('top', top);
        },


	});
});
