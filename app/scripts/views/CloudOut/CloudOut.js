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
			{title: 'in', to: 'in'},
		],
		outs: [
			// title is decorative, from: <widget model field>, to: <widget model field being listened to>
			{title: 'out', from: 'in', to: 'out'},
		],
        // Any custom DOM events should go here (Backbone style)
        widgetEvents: {},
		// typeID us the unique ID for this widget. It must be a unique name as these are global.
		typeID: 'CloudOut',
		className: 'cloudOut',
		template: _.template(Template),

		initialize: function(options) {
			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);

            // Call any custom DOM events here
            this.model.set({
                title: 'CloudOut',
                sendPeriod: 10000,
                privateKey: 'your-private-key',
                publicKey: 'your-public-key',
                averageInputs: false,
                sendToCloud: false,
            });
            
            // private variables
            this.startFrame = 0;
            this.inputLast = 0
            this.inputCumulative = 0;
            this.inputCount= 0;
            this.lastSendToCloud = false;

            // If you want to register your own signal processing function, push them to signalChainFunctions
			this.signalChainFunctions.push(this.watchData);

			// If you would like to register any function to be called at frame rate (60fps)
			window.app.timingController.registerFrameCallback(this.timeKeeper, this);
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
            
			rivets.binders.knob = function(el, value) {
				el.value = value;
				$(el).val(value);
				$(el).trigger('change');
			};
        },


		// Any custom function can be attached to the widget like this "limitServoRange" function
		// and can be accessed via this.limitServoRange();
		onRemove: function() {
			window.app.timingController.removeFrameCallback(this.timeKeeper);
		},
        
        watchData: function(input) {
			this.inputLast = Number(input);
            var value = Number(input);
            this.inputCount++;
            this.inputCumulative += Number(input);
            if (this.model.get('averageInputs')) {
                value = parseInt(this.inputCumulative / this.inputCount);
            }
            return value;
        },
        
        timeKeeper: function(frameCount) {
            var self = this;
            if (this.model.get('sendToCloud')) {
                var timeDiff = (frameCount - this.startFrame) * (1000/60);
                var period = this.model.get('sendPeriod');
                this.$('.timeLeft').text(' Send in: ' + ((period - timeDiff) / 1000).toFixed(1) + 's');
                if (timeDiff > period ) {
                    this.$('.outvalue').css('color','#ff0000');
                    this.$('.outvalue').animate({color: '#000000' },10000,'swing');
                    //var avg = (this.inputCumulative / this.inputCount).toString();
                    var avg = (this.model.get('out')).toString();
                    var pubKey = this.model.get('publicKey');
                    var priKey = this.model.get('privateKey');
					if(window.app.server) {
						var url = 'https://data.sparkfun.com/input/' + pubKey + '?private_key=' + priKey + '&testdata=' + avg;
						$.getJSON(url)
						.done(function( json ) {
							//console.log( "JSON Data: " + JSON.stringify(json) );
						})
						.fail(function( jqxhr, textStatus, error ) {
							var err = textStatus + ", " + error;
							console.log( "Connection to cloud servive failed: " + err );
							self.model.set('sendToCloud',false);
							self.$('.timeLeft').text("Couldn't connect");
						});
					}
                    console.log(timeDiff + " msecs");
                    this.startFrame = frameCount;
                    this.inputCount = 0;
                    this.inputCumulative = 0;
                }
            } else {
                this.startFrame = frameCount;
            }
        }

	});
});
