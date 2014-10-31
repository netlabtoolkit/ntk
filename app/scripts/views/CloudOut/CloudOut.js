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
			this.model.set('title', 'CloudOut');
            this.model.set({
                sendPeriod: 10000,
                privateKey: 'xxxx',
                publicKey: 'yyyy',
            });
            
            // private variables
            this.startFrame = 0;
            this.inputLast = 0
            this.inputCumulative = 0;
            this.inputCount= 0;
            this.doGet = true;

            // If you want to register your own signal processing function, push them to signalChainFunctions
			this.signalChainFunctions.push(this.watchData);

			// Likewise, if you need to register an instance-based processor
			//this.smoother = new SignalChainClasses.Smoother({tolerance: 50});
			//this.signalChainFunctions.push(this.smoother.getChainFunction());

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
            
            this.$( ".content .keys" ).change(function() {
              self.doGet = true;
            });
        },


		// Any custom function can be attached to the widget like this "limitServoRange" function
		// and can be accessed via this.limitServoRange();
		onRemove: function() {
			window.app.timingController.removeFrameCallback(this.timeKeeper);
		},
        
        watchData: function(input) {
			this.inputLast = Number(input);
            this.inputCount++;
            this.inputCumulative += Number(input);
            var avg = parseInt(this.inputCumulative / this.inputCount);
            return avg;
        },
        
        timeKeeper: function(frameCount) {
            var self = this;
            if (this.doGet) {
                var timeDiff = (frameCount - this.startFrame) * (1000/60);
                var period = this.model.get('sendPeriod');
                this.$('.timeLeft').text(' Send in: ' + ((period - timeDiff) / 1000).toFixed(1) + 's');
                if (timeDiff > period) {
                    this.$('.outvalue').css('color','#ff0000');
                    this.$('.outvalue').animate({color: '#000000' },10000,'swing');
                    var avg = (this.inputCumulative / this.inputCount).toString();
                    var pubKey = this.model.get('publicKey');
                    var priKey = this.model.get('privateKey');
                    var url = 'https://data.sparkfun.com/input/' + pubKey + '?private_key=' + priKey + '&testdata=' + avg;
                    $.getJSON(url)
                      .done(function( json ) {
                        //console.log( "JSON Data: " + JSON.stringify(json) );
                      })
                      .fail(function( jqxhr, textStatus, error ) {
                        var err = textStatus + ", " + error;
                        console.log( "Request Failed: " + err );
                        self.doGet = false;
                        self.$('.timeLeft').text('failed request');
                    });
                    console.log(timeDiff + " msecs");
                    this.startFrame = frameCount;
                    this.inputCount = 0;
                    this.inputCumulative = 0;
                }
            } else {
                //
            }
        }

	});
});
