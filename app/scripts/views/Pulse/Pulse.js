define([
	'backbone',
    'rivets',
	'views/item/WidgetMulti',
	'text!./template.js',

	// If you would like signal processing classes and functions include them here
	'utils/SignalChainFunctions',
	'utils/SignalChainClasses',
],
function(Backbone, rivets, WidgetView, Template, SignalChainFunctions, SignalChainClasses){
    'use strict';

    // next stays at 1023 this long - long enough to see, like Tween's.
    var DONE_MS = 200;

	return WidgetView.extend({
		// Map inputs to model
		// trigger / next are header ports (docs/trigger-and-next.md).
		// trigger rising past the threshold plays a burst of
		// 'triggerPulses' pulses (1 by default), the first one at once;
		// next pulses 1023 for DONE_MS when the burst's last cycle ends -
		// so one pulse of 2000ms is "wait two seconds, then carry on".
		// 'in' still pulses while held. With trigger wired and in not,
		// Pulse no longer free-runs: it waits for triggers.
		ins: [
			// title: decorative, to: <widget model field>
			{title: 'trigger', to: 'inTrigger', header: true},
			{title: 'in', to: 'in'},
            {title: 'pulseLength', to: 'timerLength'},
		],
		outs: [
			// title: decorative, from: <widget model field>, to: <widget model field being listened to>
			{title: 'out1', from: 'output', to: 'out1'},
			{title: 'next', from: 'done', to: 'out2', header: true},
		],
		sources: [],
		typeID: 'Pulse',
		className: 'pulse',
        categories: ['animation'],
		template: _.template(Template),

		initialize: function(options) {

			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);

			// Read by onModelChange, which the set below already fires.
			this.lastTrigger = 0;
			this.burstLeft = 0;      // pulses still to play from a trigger
			this.burstStart = 0;
			this.doneTimer = null;
			this.wasFree = false;    // free-running last frame

            // Call any custom DOM events here
            this.model.set({
                title: 'Pulse',
                in: '--',
                inTrigger: 0,        // the trigger port
                done: 0,             // the next port - 1023 for DONE_MS when a burst ends
                triggerPulses: 1,    // pulses per trigger
                bursting: false,     // a trigger's burst is playing - the title bar glows
                countdown: '',       // time left until next, shown in the body during a burst
				out1: 0,
                pulseLow: 0,
                pulseHigh: 1023,
                threshold: 512,
                timerFiring: true,
                timerState: 'off',
                timerStart: Date.now(),
                timerLength: 1000,
                timerHighPercentage: 50,
                randOut: false,
                randOutPulse: true,
                randLow: 0,
                randHigh: 1023,
                randTime: false,
                randTimeLow: 750,
                randTimeHigh: 2000,
            });
            
            this.stateHighlight = '#f8c885';
            this.domReady = false;
            this.lastTimeLength = this.model.get('timerLength');

			this.localTimeKeeperFunc = function(frameCount) {
				this.timeKeeper(frameCount);
			}.bind(this);

			window.app.timingController.registerFrameCallback(this.localTimeKeeperFunc, this);

		},
        /**
         * called when widget is rendered
         *
         * @return
         */
		onRender: function() {
			WidgetView.prototype.onRender.call(this);

            var self = this;
            
            if(!app.server) {
                this.$('.pulseHigh').css('background-color','#fff');
                this.$('.pulseLow').css('background-color',this.stateHighlight);
            }
            
            this.domReady = true;
            
		},
        
        onRemove: function() {
			window.app.timingController.removeFrameCallback(this.localTimeKeeperFunc, this);
			clearTimeout(this.doneTimer);
		},

        setFromModel: function(model) {
            var result = WidgetView.prototype.setFromModel.call(this, model);
            this.model.set({done: 0, bursting: false, countdown: ''});   // a patch saved mid-pulse
            return result;
        },

        onModelChange: function(model, options) {
            // trigger rising past the threshold starts a burst. Compared
            // with the last value handled, not just "listed as changed":
            // Backbone fires this again with the same changes after a
            // nested set (CLAUDE.md). Only a value arriving through a
            // cable counts (updateNoTrigger) - not one a patch loads.
            if(model.changedAttributes().inTrigger !== undefined && options && options.updateNoTrigger) {
                var trig = parseFloat(this.model.get('inTrigger')) || 0;
                var trigThreshold = parseFloat(this.model.get('threshold'));
                if (isNaN(trigThreshold)) { trigThreshold = 512; }
                var rose = this.lastTrigger < trigThreshold && trig >= trigThreshold;
                this.lastTrigger = trig;
                if (rose) { this.startBurst(); }
            }

            if(model.changedAttributes().in !== undefined && !isNaN(model.changedAttributes().in)) {
                if (this.model.get('in') >= this.model.get('threshold')) {
                    if (!this.model.get('timerFiring')) {
                        this.model.set('timerFiring',true);
                        if (!app.server) {
                            this.$('.pulseHigh').css('background-color','#fff');
                            this.$('.pulseLow').css('background-color',this.stateHighlight);
                        }
                        this.initTimer();
                    }
                } else if (this.model.get('timerFiring')) {
                    this.model.set('timerFiring',false);
                    if (!this.model.get('randOut') || this.model.get('randOutPulse')) {
                        this.model.set('output',parseFloat(this.model.get('pulseLow'),10));
                        if (!app.server) {
                            this.$('.pulseHigh').css('background-color','#fff');
                            this.$('.pulseLow').css('background-color',this.stateHighlight);
                        }
                    }
                }
            }
            
            /*
            if(model.changedAttributes().timerLength !== undefined && !isNaN(model.changedAttributes().timerLength)) {
                if (this.lastTimeLength != this.model.get('timerLength')) {
                    if (!this.model.get('randTime')) {
                        if (this.model.get('timerLength') < 150) this.model.set('timerLength',150);
                    }
                }
                this.lastTimeLength = this.model.get('timerLength');
            }
            */
        },
        
        /**
         * triggerWired - something is wired into the trigger port.
         *
         * @return {boolean}
         */
        triggerWired: function() {
            return _.some(this.sources, function(source) { return source.map && source.map.destinationField === 'inTrigger'; });
        },

        /**
         * freeRunAllowed - the in-driven (or, unwired, constant) pulsing
         * may run: not when trigger is wired and in isn't, as then only
         * triggers make pulses.
         *
         * @return {boolean}
         */
        freeRunAllowed: function() {
            return this.model.get('in') !== '--' || !this.triggerWired();
        },

        /**
         * startBurst - what trigger does: the first pulse at once, then
         * the rest of 'triggerPulses', each one timerLength long. A
         * trigger during a burst starts it again.
         *
         * @return {void}
         */
        startBurst: function() {
            var n = parseInt(this.model.get('triggerPulses'), 10);
            this.burstLeft = (isNaN(n) || n < 1) ? 1 : n;
            this.startBurstCycle();
            this.model.set('bursting', true);
        },

        startBurstCycle: function() {
            this.burstStart = Date.now();
            if (this.model.get('randTime')) this.setRandomTime();
            if (this.model.get('randOut')) this.setRandomOut();
            this.setHigh();
        },

        setHigh: function() {
            this.model.set('output',parseFloat(this.model.get('pulseHigh'),10));
            if (!app.server) {
                this.$('.pulseHigh').css('background-color',this.stateHighlight);
                this.$('.pulseLow').css('background-color','#fff');
            }
        },

        setLow: function() {
            if (!this.model.get('randOut') || this.model.get('randOutPulse')) {
                this.model.set('output',parseFloat(this.model.get('pulseLow'),10));
                if (!app.server) {
                    this.$('.pulseHigh').css('background-color','#fff');
                    this.$('.pulseLow').css('background-color',this.stateHighlight);
                }
            }
        },

        /**
         * burstTick - one frame of a trigger's burst: low after the on
         * part of each cycle, the next cycle (or, after the last, next
         * and back to free-running if allowed) at the end of one.
         *
         * @return {void}
         */
        burstTick: function() {
            var length = parseFloat(this.model.get('timerLength'));
            if (isNaN(length) || length < 1) { length = 1000; }
            var elapsed = Date.now() - this.burstStart;
            // Time left: the rest of this cycle plus the cycles still to
            // come (at today's length - rand time may change them).
            var left = Math.max(0, length - elapsed) + (this.burstLeft - 1) * length;
            this.model.set('countdown', (Math.ceil(left / 100) / 10).toFixed(1) + 's');
            if (elapsed > Math.round(length * (parseFloat(this.model.get('timerHighPercentage'))/100))) {
                this.setLow();
            }
            if (elapsed > length) {
                this.burstLeft--;
                if (this.burstLeft > 0) {
                    this.startBurstCycle();
                } else {
                    this.setLow();
                    this.model.set({bursting: false, countdown: ''});
                    this.pulseDone();
                    // Back to free-running, if it may - not when only
                    // triggers make pulses, or rand time would pick a new
                    // time for nothing.
                    if (this.model.get('timerFiring') && this.freeRunAllowed()) { this.initTimer(); }
                }
            }
        },

        /**
         * pulseDone - next goes to 1023 and back to 0 after DONE_MS.
         *
         * @return {void}
         */
        pulseDone: function() {
            var self = this;
            clearTimeout(this.doneTimer);
            this.model.set('done', 1023);
            this.doneTimer = setTimeout(function() { self.model.set('done', 0); }, DONE_MS);
        },

        timeKeeper: function() {
            if (this.domReady && this.burstLeft > 0) {
                this.burstTick();
                return;
            }
            var free = this.freeRunAllowed();
            if (this.wasFree && !free) { this.setLow(); }   // trigger just wired
            this.wasFree = free;
            if (this.domReady && this.model.get('timerFiring') && free) {
                var timerDiff = Date.now() - this.model.get('timerStart');

                if (!this.model.get('randOut') || this.model.get('randOutPulse')) {
                    // check for timerHighPercentage to turn off high output
                    var timerHighLength = Math.round(this.model.get('timerLength') * (this.model.get('timerHighPercentage')/100));
                    if (Date.now() - this.model.get('timerStart') > timerHighLength) {
                        this.model.set('output',parseFloat(this.model.get('pulseLow'),10));
                        if (!app.server) {
                            this.$('.pulseHigh').css('background-color','#fff');
                            this.$('.pulseLow').css('background-color',this.stateHighlight);
                        }
                    }
                }

                if (Date.now() - this.model.get('timerStart') > this.model.get('timerLength')) {
                    // next pulse
                    this.model.set('output',parseFloat(this.model.get('pulseHigh'),10));
                    if (!app.server) {
                        this.$('.pulseHigh').css('background-color',this.stateHighlight);
                        this.$('.pulseLow').css('background-color','#fff');
                    }
                    this.initTimer();
                }
            }
        },
        
        initTimer: function() {
            this.model.set('timerStart',Date.now());
            if (this.model.get('randTime')) this.setRandomTime();
            if (this.model.get('randOut')) this.setRandomOut();
        },
        
        setRandomTime: function() {
            var min = parseFloat(this.model.get('randTimeLow'),10);
            var max = parseFloat(this.model.get('randTimeHigh'),10)
            var randomTime = Math.floor(Math.random() * (max - min)) + min;
            this.model.set('timerLength',randomTime);
        },
            
        setRandomOut: function() {
            var min = parseFloat(this.model.get('randLow'),10);
            var max = parseFloat(this.model.get('randHigh'),10)
            var output = Math.floor(Math.random() * (max - min + 1)) + min;
            this.model.set('pulseHigh',output);
        },

	});
});
