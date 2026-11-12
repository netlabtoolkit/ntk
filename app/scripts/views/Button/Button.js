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

	// done stays at 1023 this long - long enough to see, like DigitalIn's.
	var DONE_MS = 200;

	return WidgetView.extend({
		// Define the inlets
		ins: [
			// title is decorative, to: <widget model field being set by inlet>
			//{title: 'in', to: 'in'},
		],
		outs: [
			// title is decorative, from: <widget model field>, to: <widget model field being listened to>
			{title: 'out', from: 'in', to: 'out'},
			// A header port (plans/control-flow.md): pulses 1023 for
			// DONE_MS on each press, so a click starts a Scene, Sequence,
			// SpeechOut... with nothing but the screen - a start/done
			// chain can be tried with no hardware. out stays for the
			// level (high while held).
			{title: 'next', from: 'done', to: 'done', header: true, noChain: true},
		],
        // Any custom DOM events should go here (Backbone style)
        widgetEvents: {
			'mouseup .dragKnob': 'imgMoved',
            'change .buttonLabel': 'setStyle',
            'change .buttonFontSize': 'setStyle',
            'change .buttonWidth': 'setStyle',
            'change .buttonHeight': 'setStyle',
		},
		// typeID us the unique ID for this widget. It must be a unique name as these are global.
		typeID: 'Button',
		categories: ['UI'],
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
                buttonLabel: "Button Label",
                buttonFontSize: "30px",
                buttonWidth: 200,
                buttonHeight: 200,
                done: 0,
            });
            this.doneTimer = null;
            
            this.stateHighlight = '#f8c885';
            
            //this.signalChainFunctions.push(SignalChainFunctions.scale);
            
            this.model.set('in', this.model.get('outputFloor'));

            // If you want to register your own signal processing function, push them to signalChainFunctions
			//this.signalChainFunctions.push(this.limitRange);

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
			// always call the superclass
            WidgetView.prototype.onRender.call(this);

            var self = this;

            
            if(!app.server) {
                this.$( ".theButton" ).button({
                  label: "Button"
                });
                self.$('.buttonOn').css('background-color','#fff');
                self.$('.buttonOff').css('background-color',self.stateHighlight);

                this.$( ".theButton" ).mousedown(function() {
                    self.model.set('in', parseInt(self.model.get('outputCeiling'),10));
                    self.pulseDone();
                    if(!app.server) {
                        self.$('.buttonOn').css('background-color',self.stateHighlight);
                        self.$('.buttonOff').css('background-color','#fff');
                    }
                });
                this.$( ".theButton" ).mouseup(function() {
                    self.model.set('in', parseInt(self.model.get('outputFloor'),10));
                    if(!app.server) {
                        self.$('.buttonOn').css('background-color','#fff');
                        self.$('.buttonOff').css('background-color',self.stateHighlight);
                    }
                });

                this.$( ".theButton" ).on('touchstart',function(e) {
                    // A touch is followed by a synthesized mousedown;
                    // without this, one tap would pulse done twice.
                    e.preventDefault();
                    self.model.set('in', parseInt(self.model.get('outputCeiling'),10));
                    self.pulseDone();
                    if(!app.server) {
                        self.$('.buttonOn').css('background-color',self.stateHighlight);
                        self.$('.buttonOff').css('background-color','#fff');
                    }
                });

                this.$( ".theButton" ).on('touchend',function() {
                    self.model.set('in', parseInt(self.model.get('outputFloor'),10));
                    if(!app.server) {
                        self.$('.buttonOn').css('background-color','#fff');
                        self.$('.buttonOff').css('background-color',self.stateHighlight);
                    }
                });

                this.$( ".theButton" ).on('touchcancel',function() {
                    self.model.set('in', parseInt(self.model.get('outputFloor'),10));
                    if(!app.server) {
                        self.$('.buttonOn').css('background-color','#fff');
                        self.$('.buttonOff').css('background-color',self.stateHighlight);
                    }
                });
            
            
            
                this.$( '.detachedEl' ).css( 'position', 'fixed' );
                this.$( '.detachedEl' ).draggable({ 
                    cursor: 'move',
                    handle: '.dragKnob',
                });
                this.$( '.dragKnob' ).css( 'cursor', 'move' );
                
                this.setStyle();
            }
        },

        /**
         * setFromModel - a patch saved mid-pulse stores done at 1023,
         * with no timer left to bring it back down, so done always loads
         * as 0.
         *
         * @param {object} model
         * @return {WidgetView} this view
         */
        setFromModel: function(model) {
            var result = WidgetView.prototype.setFromModel.call(this, model);
            this.model.set('done', 0);
            return result;
        },

        /**
         * pulseDone - done goes to 1023 and back to 0 after DONE_MS.
         *
         * @return {void}
         */
        pulseDone: function() {
            var self = this;
            clearTimeout(this.doneTimer);
            this.model.set('done', 1023);
            this.doneTimer = setTimeout(function() { self.model.set('done', 0); }, DONE_MS);
        },

        onRemove: function() {
            clearTimeout(this.doneTimer);
        },

        imgMoved: function(e) {
            // position:fixed box - read raw css left/top (round-trips with
            // the rv-positionx/y binders); .offset() adds page scroll and
            // drifts the box on every move. Clamp so it stays reachable.
            var $box = this.$('.detachedEl');
            var left = parseInt($box.css('left'), 10) || 0;
            var top = parseInt($box.css('top'), 10) || 0;
            left = Math.max(0, Math.min(left, (window.innerWidth || 1200) - 60));
            top = Math.max(0, Math.min(top, (window.innerHeight || 800) - 40));
            $box.css({ left: left + 'px', top: top + 'px' });
            this.model.set('left', left);
            this.model.set('top', top);
        },
        
        setStyle: function(e) {
            if(!app.server) {
                var el = this.$(".theButton");
                el.button({
                    label: this.model.get('buttonLabel'),
                });
                this.$( ".theButton.ui-widget" ).css('width',this.model.get('buttonWidth'));
                this.$( ".theButton.ui-widget" ).css('height',this.model.get('buttonHeight'));

                el.css('font-size', this.model.get('buttonFontSize'));
            }
        },

	});
    

});
