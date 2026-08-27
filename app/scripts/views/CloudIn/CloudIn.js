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
			'change .getFromCloud': 'getFromCloud',
		},


		typeID: 'CloudIn',
        categories: ['network'],
		className: 'cloudIn',
		template: _.template(Template),

		initialize: function(options) {
			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);

            // Call any custom DOM events here
            this.model.set({
                title: 'CloudIn',
                getPeriod: 10000,
                // io.adafruit.com
                aioUsername: '',
                aioKey: '',
                aioFeedKey: '',
                //
                getFromCloud: false,
                displayTimerStart: false,
                displayText: "Stopped",
            });

            // private variables
            this.startTime = 0;
            this.lastSendToCloud = false;
            this.lastTimeDiff = 0;
            this.startCountdown = true;
            this.redPulseCount = 0;

            this.signalChainFunctions.push(SignalChainFunctions.scale);
			// If you would like to register any function to be called at frame rate (60fps)
			//console.log('register!');
			//window.app.server &&
			this.localTimeKeeperFunc = function(frameCount) {
				this.timeKeeper(frameCount);
			}.bind(this);

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

        getFromCloud: function(e) {
            if (!app.server && !this.model.get('sendToCloud')) {
                this.setDisplayText("Stopped");
            }
        },

        setDisplayText: function(text) {
            if(!app.server) {
                this.$('.timeLeft').text(text);
            }
        },

        onModelChange: function(model) {
            if(!app.server) {
                if (model.changedAttributes().in) {
                    this.$('.dial').val(this.model.get('in')).trigger('change');
                }
            }
        },

        timeKeeper: function(frameCount) {
            //console.log(frameCount);
            if (this.model.get('getFromCloud')) {
                var self = this;
                var period = this.model.get('getPeriod');
                if (this.lastSendToCloud == false) { // starting to send to cloud
                    this.startTime = Date.now() - (period + 1) ;
                    this.lastSendToCloud = true;
                    //console.log("reset");
                }
                var timeDiff = Date.now() - this.startTime;
                if (timeDiff > period) { // get from cloud
                    //console.log("getting");
                    this.startTime = Date.now();
                    if(!app.server) this.$('.outvalue').css('color','#ff0000'); // start the RED pulse
                    this.setDisplayText(' Get in: ' + (period / 1000).toFixed(1) + 's');

                    this.lastTimeDiff = 0;
                    if ((app.server && app.serverMode) || (!app.server && !app.serverMode)) {
                        // only send if we're the server and in server mode, or the browser in authoring mode

                        // IO.ADAFRUIT.COM
                        // https://io.adafruit.com/api/docs/#data - GET the
                        // most recent value from the feed.
                        var username = this.model.get('aioUsername');
                        var feedKey = this.model.get('aioFeedKey');
                        var url = "https://io.adafruit.com/api/v2/" + username + "/feeds/" + feedKey + "/data/last";
                        $.ajax({
                            url: url,
                            type: 'GET',
                            headers: { 'X-AIO-Key': this.model.get('aioKey') },
                            dataType: 'json',
                            timeout: 5000,
                            success: function(response) {
                                var value = parseFloat(response && response.value);
                                if (isNaN(value)) {
                                    self.model.set('getFromCloud', false);
                                    self.setDisplayText("Bad data");
                                } else {
                                    self.model.set('in', value);
                                }
                            },
                            error: function(jqxhr, textStatus, error) {
                                console.log("Connection to cloud service failed: " + textStatus + ", " + error);
                                self.model.set('getFromCloud', false);
                                if (jqxhr.status === 401 || jqxhr.status === 403) {
                                    self.setDisplayText("Invalid key");
                                } else if (jqxhr.status === 404) {
                                    self.setDisplayText("Invalid feed");
                                } else {
                                    self.setDisplayText("Can't connect");
                                }
                            }
                        });
                    }
                    this.inputCount = 0;
                    this.inputCumulative = 0;
                } else if (timeDiff - this.lastTimeDiff >= 100) {
                    this.setDisplayText(' Get in: ' + ((period - timeDiff) / 1000).toFixed(1) + 's');
                    if (!app.server && timeDiff >= 300) this.$('.outvalue').css('color','#000000'); // stop the RED pulse
                    this.lastTimeDiff = timeDiff;
                }
            } else {
                this.lastSendToCloud = false;
            }
        },

	});
});
