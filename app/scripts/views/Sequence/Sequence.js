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
],
function(Backbone, rivets, WidgetView, Template, SignalChainFunctions, SignalChainClasses, velocity, Velocity){
    'use strict';

	// done stays at 1023 this long - long enough to see, like SpeechOut's.
	var DONE_MS = 200;

	return WidgetView.extend({
		// start / done are header ports (plans/control-flow.md). start
		// plays the sequence picked in the more panel ("start plays":
		// 1-4, or random) when it rises past the threshold, and keeps
		// playing when it falls - so a done pulse from another widget can
		// start it. The four step inlets stay in the body and still play
		// only while held high. done pulses 1023 for DONE_MS when a
		// sequence without loop plays its last move, whichever inlet
		// started it; a cancelled or looping sequence doesn't send it.
		ins: [
			// title: decorative, to: <widget model field>
			{title: 'start', to: 'inStart', header: true},
			{title: 'in1', to: 'in0'},
			{title: 'in2', to: 'in1'},
            {title: 'in3', to: 'in2'},
			{title: 'in4', to: 'in3'},
		],
		outs: [
			// title: decorative, from: <widget model field>, to: <widget model field being listened to>
			{title: 'out1', from: 'output0', to: 'out0'},
			{title: 'done', from: 'done', to: 'out4', header: true},
            /*{title: 'out1', from: 'output1', to: 'out1'},
            {title: 'out1', from: 'output2', to: 'out2'},
            {title: 'out1', from: 'output3', to: 'out3'},*/
		],
		sources: [],
		typeID: 'Sequence',
		className: 'sequence',
        categories: ['animation'],
		template: _.template(Template),

		initialize: function(options) {

			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);

			// Read by onModelChange, which the set below already fires.
			this.lastStart = 0;
			this.doneTimer = null;
			this.lastPlayed = -1;   // the last sequence played, by any inlet - random avoids it

            // Call any custom DOM events here
            this.model.set({
                title: 'Sequence',
                in0: 0, in1: 0, in2: 0, in3: 0,
                out0: 0, out1: 0, out2: 0, out3: 0,
                output0: 0, output1: 0, output2: 0, output3: 0,
                lastIns: [-1,-1,-1,-1],
				output: 0,
                // Off by default: a looping sequence never finishes, so
                // it never sends done. Saved patches keep their own.
                loop0: false, loop1: false, loop2: false, loop3: false,
                returnToStart0: true, returnToStart1: true, returnToStart2: true, returnToStart3: true,
                start0: 0, start1: 0, start2: 0, start3: 0, 
                duration0: 1000, duration1: 1000, duration2: 1000, duration3: 1000,
                sendTo0: "output0", sendTo1: "output0", sendTo2: "output0", sendTo3: "output0", 
                playSequence: false,
                threshold: 512,
                inStart: 0,          // the start port
                startPlays: '0',     // which sequence start plays: '0'-'3', or 'random'
                done: 0,             // the done port - 1023 for DONE_MS when a sequence finishes
                animationRunning: false,
                lastInput: -1,
                sequence0: "0,500,200\n500,100,500\n100,500,500\n500,0,200",
                sequence1: "0,500,400\n500,100,1000\n100,500,1000\n500,0,400",
                sequence2: "0,500,600\n500,100,1500\n100,500,1500\n500,0,600",
                sequence3: "0,500,800\n500,100,2000\n100,500,2000\n500,0,800",
                currentSequence: 0,
                sequencePosition: 0,
                domReady: false,
                
            });

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
            //if ((app.server && app.serverMode) || (!app.server && !app.serverMode)) {
                this.$(".animateDiv").velocity("stop",true);
            //}
            
            //console.log('starting ' + this.model.get('currentSequence'));
            //console.log(this.model.get('out0'));
            this.model.set('domReady',true);

		},
        
        onRemove: function() {
			clearTimeout(this.doneTimer);
			this.$(".animateDiv").velocity("stop",true);
		},

        onModelChange: function(model, options) {
            if (this.model.get('domReady') === true) {
                // start rising past the threshold plays the chosen
                // sequence. Compared with the last value handled, not
                // just "listed as changed": Backbone fires this again
                // with the same changes after a nested set (CLAUDE.md).
                // Only a value arriving through a cable counts
                // (syncWithSource marks those with updateNoTrigger), as
                // in Scene - not one a patch loads.
                if (model.changedAttributes().inStart !== undefined && options && options.updateNoTrigger) {
                    var start = parseFloat(this.model.get('inStart')) || 0;
                    var startThreshold = parseFloat(this.model.get('threshold'));
                    if (isNaN(startThreshold)) { startThreshold = 512; }
                    var rose = this.lastStart < startThreshold && start >= startThreshold;
                    this.lastStart = start;
                    if (rose) { this.playStart(); }
                }

                if(model.changedAttributes().in0 !== undefined || 
                   model.changedAttributes().in1 !== undefined ||
                   model.changedAttributes().in2 !== undefined ||
                   model.changedAttributes().in3 !== undefined) {

                    var ins = [];
                    ins[0] = parseFloat(this.model.get('in0'));
                    ins[1] = parseFloat(this.model.get('in1'));
                    ins[2] = parseFloat(this.model.get('in2'));
                    ins[3] = parseFloat(this.model.get('in3'));

                    var threshold = parseInt(this.model.get('threshold'));
                    //console.log(threshold + ' ' + ins[0] + ' ' + this.model.get('lastIns')[0]);

                    for (var i=0;i<4;i++) {

                        if (ins[i] >= threshold && this.model.get('lastIns')[i] < threshold) {
                            //this.$(".animateDiv").velocity("stop",true);
                            //console.log('starting');
                            this.model.set('animationRunning',false);
                            this.model.set('currentSequence',i);
                            this.runAnimation();

                        } else if (ins[i] < threshold  && this.model.get('lastIns')[i] >= threshold) {
                            //console.log('cancel ' + this.model.get('currentSequence') + ' ' + i);
                            if (i === this.model.get('currentSequence')) {
                                //console.log('cancel really');
                                this.$(".animateDiv").velocity("stop",true);
                                this.model.set('animationRunning',false);
                                var returnToStart = "returnToStart" + i.toString();
                                if (this.model.get(returnToStart)) { 
                                    this.returnAnimation();
                                }
                            }
                        }
                        this.model.get('lastIns')[i] = ins[i];
                    }
                }
/*                if(model.changedAttributes().loop0 !== undefined ) {
                   if (!this.model.get('loop')) {
                        this.$(".animateDiv").velocity("stop",true);
                        this.model.set('animationRunning',false);
                    }
                }*/
                if(model.changedAttributes().threshold !== undefined ) {
                    this.$(".animateDiv").velocity("stop",true);
                    this.model.set('animationRunning',false);
                    for (var i=0;i<4;i++) {
                       this.model.get('lastIns')[i] = -1;
                   }
                }
            }
        },
        
        
        runAnimation: function() {
            if ((app.server && app.serverMode) || (!app.server && !app.serverMode)) {

                var self = this;
                var animateDiv = this.$(".animateDiv");
                animateDiv.velocity("stop",true);
                if (!this.model.get('animationRunning')) {

                    // build a sequence from the text field in the widget
                    var userSequence = [];
                    var velocitySequence = [];
                    var currentSequence = this.model.get('currentSequence').toString();
                    this.lastPlayed = parseInt(currentSequence, 10);

                    var sequence = "sequence" + currentSequence;
                    var loop = "loop" + currentSequence;
                    var outputPort = this.model.get('sendTo' + currentSequence);

                    // get the string and parse it into an array
                    // the format for each move in the sequence is start, end, duration, one move to a line
                    var str = this.model.get(sequence);
                            
                    str = str.replace(/(\r\n|\n|\r)/gm, "\n");
                    str.split('\n').forEach( function(item) {
                        var move = item.split(',');
                        userSequence.push(move);
                    } );

                    var sequenceLen = userSequence.length;
                    self.model.set('sequencePosition',0);
                    // build the Velocity sequence http://julian.com/research/velocity/#uiPack
                    userSequence.forEach( function(item) { 
                         var obj = {
                              e: animateDiv,
                              p: { tween: [ item[1], item[0] ] },
                              o: { 
                                  duration: item[2],
                                  progress: function(elements, c, r, s, t) {
                                      self.model.set(outputPort,t);
                                  },
                                  complete: function() {
                                      var currentPosition = 1 + self.model.get('sequencePosition');
                                      if (currentPosition >= sequenceLen) {
                                          if (self.model.get(loop)) {
                                              self.model.set('sequencePosition',0);
                                              animateDiv.velocity("stop",true);
                                              if (self.model.get('domReady') === true && self.model.get('animationRunning')) {
                                                  $.Velocity.RunSequence(velocitySequence);
                                              }
                                          } else {
                                              self.model.set('animationRunning',false);
                                              self.pulseDone();
                                          }
                                      } else {
                                          self.model.set('sequencePosition',currentPosition);
                                      }
                                  },
                              },
                         }
                         velocitySequence.push(obj);
                    } );

                    // execute the sequence
                    this.model.set('animationRunning',true);
                    $.Velocity.RunSequence(velocitySequence);
                }
            }
        },
        
        /**
         * playStart - what start does: play the sequence picked in
         * "start plays", or one of the four at random - never the one
         * that played last, so the same behaviour doesn't run twice in
         * a row.
         *
         * @return {void}
         */
        playStart: function() {
            var pick = this.model.get('startPlays');
            var i;
            if (pick === 'random') {
                var last = this.lastPlayed;
                var choices = [0, 1, 2, 3].filter(function(n) { return n !== last; });
                i = choices[Math.floor(Math.random() * choices.length)];
            } else {
                i = parseInt(pick, 10);
            }
            if (isNaN(i) || i < 0 || i > 3) { i = 0; }
            this.model.set('animationRunning',false);
            this.model.set('currentSequence',i);
            this.runAnimation();
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

        returnAnimation: function() {
            if ((app.server && app.serverMode) || (!app.server && !app.serverMode)) {
                this.$(".animateDiv").velocity("stop",true);
                
                var currentSequence = this.model.get('currentSequence').toString();
                
                var duration = parseInt(this.model.get('duration' + currentSequence));
                var end = parseFloat(this.model.get('start' + currentSequence));
                var start = parseFloat(this.model.get('output0'));

                var self = this;
                var animateDiv = this.$(".animateDiv");
                //var outputPort = this.model.get('sendTo' + currentSequence); 
                var outputPort = 'output0';

                animateDiv.velocity({
                    tween: [ end, start ]
                }, {
                    duration: duration,
                    progress: function(elements, c, r, s, t) {
                        //console.log("The current tween value is " + t);
                        self.model.set(outputPort,t);
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
