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
        widgetEvents: {
			'change .sendToCloud': 'sendToCloud',
		},
		// typeID us the unique ID for this widget. It must be a unique name as these are global.
		typeID: 'CloudOut',
        categories: ['network'],
		className: 'cloudOut',
		template: _.template(Template),

		initialize: function(options) {
			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);

            // Call any custom DOM events here
            this.model.set({
                title: 'CloudOut',
                sendPeriod: 10000,
                // io.adafruit.com
                aioUsername: '',
                aioKey: '',
                aioFeedKey: '',
                //
                averageInputs: false,
                roundOutput: true,
                sendToCloud: false,
                displayTimerStart: false,
                displayText: "Stopped",
                //
                lastValueSentToCloud: "-1000",
                lastTimeSentToCloud: 0,

            });

            // private variables
            this.startTime = 0;
            this.lastSendToCloud = false;
            this.lastTimeDiff = 0;
            this.inputLast = 0;
            this.inputCumulative = 0;
            this.inputCount = 0;
            this.redPulseCount = 0;


            // If you want to register your own signal processing function, push them to signalChainFunctions
			this.signalChainFunctions.push(this.watchData);

			this.localTimeKeeperFunc = function(frameCount) {
				this.timeKeeper(frameCount);
			}.bind(this);
			// If you would like to register any function to be called at frame rate (60fps)
			//window.app.server &&
			window.app.timingController.registerFrameCallback(this.localTimeKeeperFunc, this);
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
			window.app.timingController.removeFrameCallback(this.localTimeKeeperFunc, this);
		},

        watchData: function(input) {
            var value = input;

            if (this.model.get('averageInputs')) {
                this.inputCount++;
                this.inputCumulative += Number(input);
                value = this.inputCumulative / this.inputCount;
            }

            if (this.model.get('roundOutput')) {
                value = Math.round(value);
            }

            return value;
        },

        sendToCloud: function(e) {
            //console.log('sendtocloud: ' + this.model.get('sendToCloud'));
            if(!app.server && !this.model.get('sendToCloud')) {
                //console.log('stopped');
                this.setDisplayText("Stopped");
            }
        },

        setDisplayText: function(text) {
            if(!app.server) {
                this.$('.timeLeft').text(text);
            }
        },

        timeKeeper: function(frameCount) {
            if (this.model.get('sendToCloud')) {
                var self = this;
                var period = this.model.get('sendPeriod');


                if (this.lastSendToCloud == false) { // starting to send to cloud
                    this.startTime = Date.now() - (period + 1) ;
                    this.lastSendToCloud = true;
                    //console.log("reset");
                }

                var timeDiff = Date.now() - this.startTime;
                var lastTimeSentTimeDiff = Date.now() - this.model.get('lastTimeSentToCloud');
                var theValue = (this.model.get('out')).toString();

                if (timeDiff >= period ||
                    (this.model.get('lastValueSentToCloud') != theValue && lastTimeSentTimeDiff >= period)) {
                    // send to cloud

                    this.startTime = Date.now();
                    if(!app.server) this.$('.outvalue').css('color','#ff0000'); // start the RED pulse
                    this.setDisplayText(' Send in: ' + (period / 1000).toFixed(1) + 's');

                    this.lastTimeDiff = 0;


                    if (this.model.get('lastValueSentToCloud') != theValue) {
                        // Only send changed values - no periodic resend of
                        // an unchanged value. Adafruit IO's REST API is
                        // stateless (no connection/session to keep alive),
                        // and resending unchanged values just burns into
                        // the free tier's 30-points/minute rate limit for
                        // no benefit other than a slightly more continuous-
                        // looking dashboard chart.
                        console.log('actually sending: ' + theValue);

                        if ((app.server && app.serverMode) || (!app.server && !app.serverMode)) {
                            this.model.set('lastTimeSentToCloud', Date.now());
                            // only send if we're the server and in server mode, or the browser and in authoring mode
                            //console.log("sending to cloud service, app.serverMode: " + app.serverMode);

                            // IO.ADAFRUIT.COM
                            // https://io.adafruit.com/api/docs/#data - POST
                            // a new value onto the feed.
                            var username = this.model.get('aioUsername');
                            var feedKey = this.model.get('aioFeedKey');
                            var url = "https://io.adafruit.com/api/v2/" + username + "/feeds/" + feedKey + "/data";
                            $.ajax({
                                url: url,
                                type: 'POST',
                                headers: { 'X-AIO-Key': this.model.get('aioKey') },
                                contentType: 'application/json',
                                data: JSON.stringify({ value: theValue }),
                                timeout: 5000,
                            })
                                .done(function(response) {
                                    //console.log(response);
                                })
                                .fail(function(jqxhr, textStatus, error) {
                                    console.log("Connection to cloud service failed: " + textStatus + ", " + error);
                                    self.model.set('sendToCloud', false);
                                    if (jqxhr.status === 401 || jqxhr.status === 403) {
                                        self.setDisplayText("Invalid key");
                                    } else if (jqxhr.status === 404) {
                                        self.setDisplayText("Invalid feed");
                                    } else {
                                        self.setDisplayText("Can't connect");
                                    }
                                });
                            this.model.set('lastValueSentToCloud',theValue);
                            this.inputCount = 0;
                            this.inputCumulative = 0;
                        }
                    }
                } else if (timeDiff - this.lastTimeDiff >= 100) {
                    this.setDisplayText(' Send in: ' + ((period - timeDiff) / 1000).toFixed(1) + 's');
                    if (!app.server && timeDiff >= 300) this.$('.outvalue').css('color','#000000'); // stop the RED pulse
                    this.lastTimeDiff = timeDiff;
                }
            } else {
                this.lastSendToCloud = false;
            }
        },

	});
});
