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

	return WidgetView.extend({
		// Map inputs to model
		ins: [
			// title: decorative, to: <widget model field>
			{title: 'in1', to: 'in0'},
			{title: 'in2', to: 'in1'},
            {title: 'in3', to: 'in2'},
			{title: 'in4', to: 'in3'},
		],
		outs: [
			// title: decorative, from: <widget model field>, to: <widget model field being listened to>
			{title: 'out1', from: 'output', to: 'out1'},
		],
		sources: [],
		typeID: 'Sequence',
		className: 'sequence',
        categories: ['generator'],
		template: _.template(Template),

		initialize: function(options) {

			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);
            
            // Call any custom DOM events here
            this.model.set({
                title: 'Sequence',
                in0: 0,
				in1: 0,
                in2: 0,
				in3: 0,
                lastIns: [-1,-1,-1,-1],
				output: 0,
                duration: 2000,
                start: 0,
                returnToStart: true,
                loop: true,
                playSequence: false,
                threshold: 512,
                animationRunning: false,
                lastInput: -1,
                sequence0: "0,500,200\n500,100,500\n100,500,500\n1000,0,200",
                sequence1: "0,500,400\n500,100,1000\n100,1000,500\n1000,0,400",
                sequence2: "0,500,600\n500,100,1500\n100,1500,500\n1000,0,600",
                sequence3: "0,500,800\n500,100,2000\n100,2000,500\n1000,0,800",
                currentSequence: 0,
                sequencePosition: 0,
                
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
            
            if (this.model.get('loop') && this.model.get('in') == '--') {
                this.runAnimation();
            }
		},
        
        onModelChange: function(model) {
            if(model.changedAttributes().in0 !== undefined || 
               model.changedAttributes().in1 !== undefined ||
               model.changedAttributes().in2 !== undefined ||
               model.changedAttributes().in3 !== undefined) {
                
                var ins = [];
                ins[0] = parseFloat(this.model.get('in0'));
                ins[1] = parseFloat(this.model.get('in1'));
                ins[2] = parseFloat(this.model.get('in2'));
                ins[3] = parseFloat(this.model.get('in3'));
                
                var threshold = parseFloat(this.model.get('threshold'));
                
                for (var i=0;i<4;i++) {

                    if (ins[i] >= threshold && this.model.get('lastIns')[i] < threshold) {
                        this.$(".animateDiv").velocity("stop");
                        this.model.set('animationRunning',false);
                        this.model.set('currentSequence',i);
                        this.runAnimation();

                    } else if (ins[i] < threshold  && this.model.get('lastIns')[i] >= threshold) {
                        if (i === this.model.get('currentSequence')) {
                            this.$(".animateDiv").velocity("stop");
                            this.model.set('animationRunning',false);
                            if (this.model.get('returnToStart')) {
                                this.returnAnimation();
                            }
                        }
                    }
                    this.model.get('lastIns')[i] = ins[i];
                }
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
        
        
        runAnimation: function() {
            if ((app.server && app.serverMode) || (!app.server && !app.serverMode)) {

                var self = this;
                var animateDiv = this.$(".animateDiv");

                if (!this.model.get('animationRunning')) {

                    // build a sequence from the text field in the widget
                    var userSequence = [];
                    var velocitySequence = [];

                    // get the string and parse it into an array
                    // the format for each move in the sequence is start, end, duration, one move to a line
                    var sequence = "sequence" + this.model.get('currentSequence').toString();

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
                                      self.model.set('output',t);
                                  },
                                  complete: function() {
                                      var currentPosition = 1 + self.model.get('sequencePosition');
                                      if (currentPosition >= sequenceLen) {
                                          if (self.model.get('loop')) {
                                              self.model.set('sequencePosition',0);
                                              $.Velocity.RunSequence(velocitySequence);
                                          } else {
                                              self.model.set('animationRunning',false);
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
                    $.Velocity.RunSequence(velocitySequence);
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
