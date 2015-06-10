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

	return WidgetView.extend({
		// Map inputs to model
		ins: [
			// title: decorative, to: <widget model field>
			{title: 'in', to: 'in'},
            {title: 'Length', to: 'aniLength'},
            {title: 'Start', to: 'aniStart'},
            {title: 'End', to: 'aniEnd'},
		],
		outs: [
			// title: decorative, from: <widget model field>, to: <widget model field being listened to>
			{title: 'out1', from: 'output', to: 'out1'},
		],
		sources: [],
		typeID: 'Animate',
		className: 'animate',
		template: _.template(Template),

		initialize: function(options) {

			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);
            
            // Call any custom DOM events here
            this.model.set({
                title: 'Animate',
                in: 0,
				output: 0,
                aniLength: 2000,
                aniStart: 0,
                aniEnd: 1023,
                threshold: 512,
                animationRunning: false,
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

            /*this.$('.widgetBody').getScript( "velocity.min.js", function( data, textStatus, jqxhr ) {
              console.log( data ); // Data returned
              console.log( textStatus ); // Success
              console.log( jqxhr.status ); // 200
              console.log( "Velocity was loaded." );
            });
            
            this.$('.widgetBody').getScript( "velocity.ui.js", function( data, textStatus, jqxhr ) {
              console.log( data ); // Data returned
              console.log( textStatus ); // Success
              console.log( jqxhr.status ); // 200
              console.log( "VelocityUI was loaded." );
            });
            
            $('.widgetBody').velocity({
                tween: [ 500, 1000 ]
            }, { 
                easing: "easeOutCubic",
                duration: 2000,
                progress: function(elements, c, r, s, t) {
                    console.log("The current tween value is " + t)
                }
            });*/
            
            this.$(".animateDiv").css('visibility','hidden');
            this.$(".animateDiv").css('position','absolute');
            
            var self = this;

		},
        
        onModelChange: function(model) {
            if(model.changedAttributes().in !== undefined) {
                
                var input = parseFloat(this.model.get('in'));
                var length = parseFloat(this.model.get('aniLength'));
                var start = parseFloat(this.model.get('aniStart'));
                var end = parseFloat(this.model.get('aniEnd'));
                var threshold = parseFloat(this.model.get('threshold'));

                if (input >= threshold) {
                    //this.$('#ifTrue').css('background-color',this.stateHighlight);
                    //this.$('#ifFalse').css('background-color','#fff');
                    this.runAnimation(start,end,length);
                    
                } else {
                    //this.$('#ifTrue').css('background-color','#fff');
                    //this.$('#ifFalse').css('background-color',this.stateHighlight);
                    //this.model.set('output',this.model.get('ifFalse'));
                    this.$(".animateDiv").stop();
                    this.model.set('animationRunning',false);
                }
            }
        },
        
        runAnimation: function(start, end, length) {
            
            var self = this;
            var animateDiv = this.$(".animateDiv");
            
            if (!this.model.get('animationRunning')) {
                animateDiv.css('left',start + "px");
                console.log("start: " + start);
                
                animateDiv.animate({
                    left: end,
                }, {
                    duration: length,
                    step: function( now, tween ) {
                        console.log(now);
                        self.model.set('output',now);
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
