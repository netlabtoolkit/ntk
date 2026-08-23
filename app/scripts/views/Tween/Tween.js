define([
	'backbone',
    'rivets',
	'views/item/WidgetMulti',
	'text!./template.js',

	// If you would like signal processing classes and functions include them here
	'utils/SignalChainFunctions',
	'utils/SignalChainClasses',
    'velocity',
    'velocity-ui',
    'jquery',
],
function(Backbone, rivets, WidgetView, Template, SignalChainFunctions, SignalChainClasses, velocity, velocityUI, $){
    'use strict';

    // Neither the 'velocity' nor 'velocity-ui' AMD dependency reliably
    // resolves to the actual Velocity API object in this build (velocity-ui
    // in particular ignores its injected dependency and instead reads
    // global.Velocity itself - see velocity.ui.js). velocity.js does
    // reliably set `global.Velocity = Velocity` where `global` is the
    // jQuery object it was invoked with though, so $.Velocity is the one
    // reference that's actually there at module-load time.
    var Velocity = $.Velocity;

    // Velocity 1.2.3 ships bezier approximations of most Penner easings
    // (easeIn/OutQuad, Cubic, Quart, Quint, Sine, Expo, Circ) already, but
    // not Elastic/Back/Bounce - those overshoot/oscillate and can't be
    // approximated with a single cubic bezier, so port them directly from
    // https://github.com/pvanallen/VarSpeedPython/blob/master/varspeed/easing_functions.py
    // (adapted from https://github.com/semitable/easing-functions, in turn
    // from Robert Penner's original equations: https://robertpenner.com/easing/).
    // Guarded so re-requiring this module doesn't reassign every time.
    if(!Velocity.Easings.easeInElastic) {
        Velocity.Easings.easeInElastic = function(p) {
            return Math.sin(13 * Math.PI / 2 * p) * Math.pow(2, 10 * (p - 1));
        };
        Velocity.Easings.easeOutElastic = function(p) {
            return Math.sin(-13 * Math.PI / 2 * (p + 1)) * Math.pow(2, -10 * p) + 1;
        };
        Velocity.Easings.easeInOutElastic = function(p) {
            if(p < 0.5) {
                return 0.5 * Math.sin(13 * Math.PI / 2 * (2 * p)) * Math.pow(2, 10 * ((2 * p) - 1));
            }
            return 0.5 * (Math.sin(-13 * Math.PI / 2 * ((2 * p - 1) + 1)) * Math.pow(2, -10 * (2 * p - 1)) + 2);
        };

        Velocity.Easings.easeInBack = function(p) {
            return p * p * p - p * Math.sin(p * Math.PI);
        };
        Velocity.Easings.easeOutBack = function(p) {
            var q = 1 - p;
            return 1 - (q * q * q - q * Math.sin(q * Math.PI));
        };
        Velocity.Easings.easeInOutBack = function(p) {
            var q;
            if(p < 0.5) {
                q = 2 * p;
                return 0.5 * (q * q * q - q * Math.sin(q * Math.PI));
            }
            q = 1 - (2 * p - 1);
            return 0.5 * (1 - (q * q * q - q * Math.sin(q * Math.PI))) + 0.5;
        };

        Velocity.Easings.easeOutBounce = function(p) {
            if(p < 4 / 11) {
                return 121 * p * p / 16;
            }
            else if(p < 8 / 11) {
                return (363 / 40) * p * p - (99 / 10) * p + 17 / 5;
            }
            else if(p < 9 / 10) {
                return (4356 / 361) * p * p - (35442 / 1805) * p + 16061 / 1805;
            }
            return (54 / 5) * p * p - (513 / 25) * p + 268 / 25;
        };
        Velocity.Easings.easeInBounce = function(p) {
            return 1 - Velocity.Easings.easeOutBounce(1 - p);
        };
        Velocity.Easings.easeInOutBounce = function(p) {
            if(p < 0.5) {
                return 0.5 * Velocity.Easings.easeInBounce(p * 2);
            }
            return 0.5 * Velocity.Easings.easeOutBounce(p * 2 - 1) + 0.5;
        };
    }

    // Gamma isn't a single fixed curve - the exponent is user-tunable (the
    // 'gamma' field), so unlike the curves above it can't be registered
    // once with a hardcoded shape. See resolveEasing() below.
    function gammaEaseIn(p, gamma) {
        return Math.pow(p, gamma);
    }
    function gammaEaseOut(p, gamma) {
        return 1 - Math.pow(1 - p, gamma);
    }
    function gammaEaseInOut(p, gamma) {
        if(p < 0.5) {
            return 0.5 * Math.pow(2 * p, gamma);
        }
        return 0.5 * (2 - Math.pow(2 * (1 - p), gamma));
    }

	return WidgetView.extend({
		// Map inputs to model
		ins: [
			// title: decorative, to: <widget model field>
			{title: 'in', to: 'in'},
            {title: 'Duration', to: 'duration'},
            {title: 'Start', to: 'start'},
            {title: 'End', to: 'end'},
		],
		outs: [
			// title: decorative, from: <widget model field>, to: <widget model field being listened to>
			{title: 'out1', from: 'output', to: 'out1'},
		],
		sources: [],
		typeID: 'Tween',
		className: 'tween',
        categories: ['generator'],
		template: _.template(Template),

		initialize: function(options) {

			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);
            
            // Call any custom DOM events here
            this.model.set({
                title: 'Tween',
                in: '--',
				output: 0,
                duration: 2000,
                start: 0,
                end: 1023,
                returnToStart: true,
                loop: false,
                playSequence: false,
                threshold: 512,
                animationRunning: false,
                lastInput: -1,
                userSequence: "0,500,500\n500,100,1000\n100,1000,500\n1000,0,500",
                sequencePosition: 0,
                // Named 'tweenEasing', not 'easing' - the base WidgetConfig
                // model already defines a generic boolean 'easing' field
                // (AnalogIn/DigitalIn/Process's unrelated input-smoothing
                // toggle), which every widget inherits. Reusing that name
                // here meant a saved patch's stale `easing:false` silently
                // overwrote this default on load, and got passed straight
                // into Velocity's `easing` option, which crashes when it
                // tries to call `false` as a function.
                tweenEasing: 'linear',
                // Only used when 'tweenEasing' is one of the Gamma curves -
                // see resolveEasing(). 2.8 matches the default in the
                // reference varspeedpython implementation, chosen for LED
                // brightness perception.
                gamma: 2.8,

            });
            
            this.stateHighlight = '#f8c885';


		},
        /**
         * called when widget is rendered
         *
         * @return
         */
		onRender: function() {
			WidgetView.prototype.onRender.call(this);
            
            this.$(".animateDiv").css('visibility','hidden');
            this.$(".animateDiv").css('position','absolute');
            this.model.set('animationRunning',false); // in case it was true from last invocation
            
            if (this.model.get('loop') && this.model.get('in') == '--') {
                this.runAnimation();
            }
		},
        
        onModelChange: function(model) {
            if(model.changedAttributes().in !== undefined) {
                
                var input = parseFloat(this.model.get('in'));
                var lastInput = this.model.get('lastInput');
                var threshold = parseFloat(this.model.get('threshold'));

                if (input >= threshold && lastInput < threshold) {
                    this.$(".animateDiv").velocity("stop");
                    this.model.set('animationRunning',false);
                    this.runAnimation();
                    
                } else if (input < threshold  && lastInput >= threshold) {
                    this.$(".animateDiv").velocity("stop");
                    this.model.set('animationRunning',false);
                    if (this.model.get('returnToStart')) {
                        this.returnAnimation();
                    }
                }
                this.model.set('lastInput',input);
            }
            if(model.changedAttributes().loop !== undefined) {
                if (this.model.get('loop') && this.model.get('in') == '--') {
                    this.runAnimation();
                } else if (!this.model.get('loop')) {
                    this.$(".animateDiv").velocity("stop");
                    this.model.set('animationRunning',false);
                }
            }
        },
        
        
        // Gamma curves need a per-widget-tunable exponent, but Velocity's
        // named-easing registry (Velocity.Easings) is global/shared - so
        // instead of one fixed 'easeInGamma' function, register (once per
        // distinct gamma value actually used) a uniquely-named variant and
        // return that name, keeping widgets with different gamma values
        // from clobbering each other. Non-gamma easings pass through as-is.
        resolveEasing: function() {
            var easing = this.model.get('tweenEasing');

            // Velocity calls this value as a function - anything other than
            // a string (a missing/corrupt field, etc.) would throw deep
            // inside Velocity instead of failing here where it's obvious.
            if(typeof easing !== 'string' || (!Velocity.Easings[easing] && easing.indexOf('Gamma') === -1)) {
                easing = 'linear';
            }

            if(easing !== 'easeInGamma' && easing !== 'easeOutGamma' && easing !== 'easeInOutGamma') {
                return easing;
            }

            var gamma = parseFloat(this.model.get('gamma'));
            if(isNaN(gamma) || gamma <= 0) {
                gamma = 2.8;
            }

            var name = easing + '_' + String(gamma).replace(/[.-]/g, '_');
            if(!Velocity.Easings[name]) {
                var fn = easing === 'easeInGamma' ? gammaEaseIn : (easing === 'easeOutGamma' ? gammaEaseOut : gammaEaseInOut);
                Velocity.Easings[name] = function(p) { return fn(p, gamma); };
            }

            return name;
        },

        runAnimation: function() {
            if ((app.server && app.serverMode) || (!app.server && !app.serverMode)) {
                var duration = parseFloat(this.model.get('duration'));
                var start = parseFloat(this.model.get('start'));
                var end = parseFloat(this.model.get('end'));
                if (isNaN(duration)) {
                    duration = 2000;
                    this.model.set('duration',duration);
                }
                if (isNaN(start)) {
                    start = 0;
                    this.model.set('start',start);
                }
                if (isNaN(end)) {
                    end = 1023;
                    this.model.set('end',end);
                }

                var self = this;
                var animateDiv = this.$(".animateDiv");

                if (!this.model.get('animationRunning')) {
                    animateDiv.velocity({
                        tween: [ end, start ]
                    }, {
                        duration: duration,
                        easing: this.resolveEasing(),
                        progress: function(elements, c, r, s, t) {
                            //console.log("The current tween value is " + t);
                            self.model.set('output',t);
                        },
                        loop: this.model.get('loop'),
                        complete: function() {
                            self.model.set('animationRunning',false);
                        },
                    });

                    this.model.set('animationRunning', true);
                }
            }
        },
        
        returnAnimation: function() {
            if ((app.server && app.serverMode) || (!app.server && !app.serverMode)) {
                var duration = parseFloat(this.model.get('duration'));
                var end = parseFloat(this.model.get('start'));
                var start = this.model.get('output');

                var self = this;
                var animateDiv = this.$(".animateDiv");

                animateDiv.velocity({
                    tween: [ end, start ]
                }, {
                    duration: duration,
                    easing: this.resolveEasing(),
                    progress: function(elements, c, r, s, t) {
                        //console.log("The current tween value is " + t);
                        self.model.set('output',t);
                    },
                    complete: function() {
                        self.model.set('animationRunning',false);
                    },
                });

                this.model.set('animationRunning', true);
            }
        },
	});
});
