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
			{title: 'out1', from: 'output0', to: 'out0'},
            /*{title: 'out1', from: 'output1', to: 'out1'},
            {title: 'out1', from: 'output2', to: 'out2'},
            {title: 'out1', from: 'output3', to: 'out3'},*/
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
                in0: 0, in1: 0, in2: 0, in3: 0,
                out0: 0, out1: 0, out2: 0, out3: 0,
                output0: 0, output1: 0, output2: 0, output3: 0,
                lastIns: [-1,-1,-1,-1],
				output: 0,
                loop0: true, loop1: true, loop2: true, loop3: true,
                returnToStart0: true, returnToStart1: true, returnToStart2: true, returnToStart3: true,
                start0: 0, start1: 0, start2: 0, start3: 0, 
                duration0: 1000, duration1: 1000, duration2: 1000, duration3: 1000,
                sendTo0: "output0", sendTo1: "output0", sendTo2: "output0", sendTo3: "output0", 
                playSequence: false,
                threshold: 512,
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
			this.$(".animateDiv").velocity("stop",true);
		},
        
        onModelChange: function(model) {
            if (this.model.get('domReady') === true) {
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
