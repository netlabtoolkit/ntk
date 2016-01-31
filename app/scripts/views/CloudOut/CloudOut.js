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
            'change .cloudService': 'changeCloudService',
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
                cloudService: 'sparkfun',
                // sparkfun phant
                phantPrivateKey: '',
                phantPublicKey: '',
                phantDataField: 'mydata',
                phantUrl: 'https://data.sparkfun.com',
                // particle.io
                particlePin: 'D0',
                particleDeviceId: '',
                particleAccessToken: '',
                //
                averageInputs: false,
                roundOutput: true,
                sendToCloud: false,
                displayTimerStart: false,
                displayText: "Stopped",
                //
                lastValueSentToCloud: "-1000",
                lastTimeSentToCloud: 0,
                repeatSameCount: 0,
                resendRepeatSameInterval: 5,

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

			// If you would like to register any function to be called at frame rate (60fps)
			//window.app.server && 
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
            
            this.init = false; // set up to do changeCloudService to make sure interface is correct
        },


		// Any custom function can be attached to the widget like this "limitServoRange" function
		// and can be accessed via this.limitServoRange();
		onRemove: function() {
			window.app.timingController.removeFrameCallback(this.timeKeeper, this);
		},
        
        changeCloudService: function(e) {
            // update the more section to show options only for the current cloud service
            if(!app.server) {
                var service = this.model.get('cloudService');
                switch(service) {
                    case 'sparkfun':
                        //
                        this.$('.sparkfun').show();
                        this.$('.particle').hide();
                        break;
                    case 'particle':
                        this.$('.sparkfun').hide();
                        this.$('.particle').show();
                        break;
                    default:
                        //
                }
            }
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
            //console.log('sending: ' + this.model.get('sendToCloud') + this.model.get('phantDataField'));
            
            if (this.init == false) {
                this.changeCloudService();
                this.init = true;
            }
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
                    
                    
                    if (this.model.get('lastValueSentToCloud') != theValue ||
                        this.model.get('repeatSameCount') >= this.model.get('resendRepeatSameInterval') - 1) { 
                        // only send changed values
                        console.log('actually sending: ' + theValue);
                        
                        if ((app.server && app.serverMode) || (!app.server && !app.serverMode)) {
                            this.model.set('lastTimeSentToCloud', Date.now());
                            this.model.set('repeatSameCount',0);
                            // only send if we're the server and in server mode, or the browser and in authoring mode
                            //console.log("sending to cloud service, app.serverMode: " + app.serverMode);
                            switch(this.model.get('cloudService')) {
                                case 'sparkfun':
                                    // DATA.SPARKFUN.COM
                                    //
                                    var priKey = this.model.get('phantPrivateKey');
                                    var pubKey = this.model.get('phantPublicKey');
                                    var dataField = this.model.get('phantDataField');
                                    var phantUrl = this.model.get('phantUrl');

                                    var url = phantUrl + '/input/' + pubKey + '?private_key=' + priKey + '&' + dataField + '=' + theValue;
                                    $.getJSON(url)
                                        .done(function( json ) {
                                            console.log( "JSON Data: " + JSON.stringify(json) );
                                        })
                                        .fail(function( jqxhr, textStatus, error ) {
                                            var response = JSON.parse(jqxhr.responseText);
                                            var err = textStatus + ", " + error + ', ' + response.message;
                                            console.log( "Connection to cloud service failed: " + err );
                                            self.model.set('sendToCloud',false);
                                            if (response.message.indexOf('is not a valid field') >= 0) {
                                                self.setDisplayText("Invalid datafield");
                                            } else if (error == "Unauthorized") {
                                                self.setDisplayText("Invalid key");
                                            } else {
                                                self.setDisplayText("Can't connect");
                                            }
                                    });
                                    break;
                                case 'particle':
                                    // PARTICLE.IO
                                    //
                                    var url = "https://api.particle.io/v1/devices/" + this.model.get('particleDeviceId') + "/analogwrite"; 
                                    $.ajax({
                                        url: url,
                                        type: "POST",
                                        timeout: 2000,
                                        data: { access_token: this.model.get('particleAccessToken'), params: this.model.get('particlePin') + ',' + theValue }
                                        })
                                        .done(function( response ) {
                                            //console.log(response);
                                    });
                                    break;
                                default:
                            }
                        }
                    } else {
                        if ((app.server && app.serverMode) || (!app.server && !app.serverMode)) {
                            console.log('not sending due to repeat: '  + this.model.get('repeatSameCount'));
                            this.model.set('repeatSameCount',this.model.get('repeatSameCount') + 1);
                        }
                    }
                    this.model.set('lastValueSentToCloud',theValue);
                    this.inputCount = 0;
                    this.inputCumulative = 0;
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
