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
			'change #sendToCloud': 'sendToCloud',
            'change #cloudService': 'changeCloudService',
		},
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
                cloudService: 'sparkfun',
                // sparkfun phant
                phantPrivateKey: '',
                phantPublicKey: '',
                phantDataField: 'mydata',
                phantUrl: 'https://data.sparkfun.com',
                // spark.io
                sparkPin: 'D0',
                sparkDeviceId: '',
                sparkAccessToken: '',
                //
                averageInputs: false,
                sendToCloud: false,
                displayText: "Stopped",
            });
            
            // private variables
            this.startTime = 0;
            this.lastSendToCloud = false;
            this.lastTimeDiff = 0;
            this.inputLast = 0;
            this.inputCumulative = 0;
            this.inputCount = 0;
            this.startCountdown = true;


            // If you want to register your own signal processing function, push them to signalChainFunctions
			this.signalChainFunctions.push(this.watchData);

			// If you would like to register any function to be called at frame rate (60fps)
			window.app.server && window.app.timingController.registerFrameCallback(this.timeKeeper, this);
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
            
            this.changeCloudService();
        },


		// Any custom function can be attached to the widget like this "limitServoRange" function
		// and can be accessed via this.limitServoRange();
		onRemove: function() {
			window.app.timingController.removeFrameCallback(this.timeKeeper);
		},
        
        changeCloudService: function(e) {
            if(!window.app.server) {
                var service = this.model.get('cloudService');
                switch(service) {
                    case 'sparkfun':
                        //
                        this.$('#sparkfun').show();
                        this.$('#spark').hide();
                        break;
                    case 'spark':
                        this.$('#sparkfun').hide();
                        this.$('#spark').show();
                        break;
                    default:
                        //
                }
            }
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
        
        sendToCloud: function(e) {
            if(window.app.server) {
                if(!this.model.get('sendToCloud')) {
                    this.model.set('displayText',"Stopped");
                }
            }
        },
        
        onModelChange: function(model) {
            //if(!window.app.server) {
			var displayText = this.model.get('displayText');
			this.$('.timeLeft').text(displayText);

			var displayTimeLeft = Math.round(parseFloat(displayText.substring(9))*1000);
			if (displayTimeLeft >= this.model.get('sendPeriod') - 51) {
				if (this.startCountdown) {
					this.$('.outvalue').css('color','#ff0000');
					this.$('.outvalue').animate({color: '#000000' },this.model.get('sendPeriod') - 250,'swing');
					this.startCountdown = false;
				}
			}

            if(window.app.server) {
                if(model.changedAttributes().displayText) {
                    
                    if (this.model.get('sendPeriod') >= 500) {
                        var timeLeft = Math.round(parseFloat(displayText.substring(9))*1000);
                        if (timeLeft >= this.model.get('sendPeriod') - 51) {
                            if (this.startCountdown) {
                                //console.log("countdown");
                                this.$('.outvalue').css('color','#ff0000');
                                this.$('.outvalue').animate({color: '#000000' },this.model.get('sendPeriod') - 250,'swing');
                                this.startCountdown = false;
                            }
                        } else {
                            this.startCountdown = true;
                        }
                    }
                }
            } 
        },
                
        
        timeKeeper: function(frameCount) {
            var self = this;
            if (this.model.get('sendToCloud')) {
                if(window.app.server) {
                    var period = this.model.get('sendPeriod');
                    
                    if (this.lastSendToCloud == false) { // starting to send to cloud
                        this.startTime = Date.now() - (period + 1) ;
                        this.lastSendToCloud = true;
                        //console.log("reset");
                    }
                    
                    var timeDiff = Date.now() - this.startTime;
                    
                    
                    if (timeDiff > period) { // send to cloud
						console.log("sending", this.model.get('out').toString());
                        var theValue = (this.model.get('out')).toString();
							console.log(this.model.get('cloudService'));
                        
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
                                        //console.log( "JSON Data: " + JSON.stringify(json) );
                                    })
                                    .fail(function( jqxhr, textStatus, error ) {
                                        var err = textStatus + ", " + error;
                                        console.log( "Connection to cloud servive failed: " + err );
                                        self.model.set('sendToCloud',false);
                                        self.model.set('displayText',"Can't connect");
                                });
                                break;
                            case 'spark':
                                // SPARK.IO
                                //
                                var url = "https://api.spark.io/v1/devices/" + this.model.get('sparkDeviceId') + "/analogwrite"; 
                                $.ajax({
                                    url: url,
                                    type: "POST",
                                    timeout: 2000,
                                    data: { access_token: this.model.get('sparkAccessToken'), params: this.model.get('sparkPin') + ',' + theValue }
                                    })
                                    .done(function( response ) {
                                        //console.log(response);
                                });
                                break;
                            default:
                                //
                        }
                        this.startTime = Date.now();
                        this.inputCount = 0;
                        this.inputCumulative = 0;
                        if (this.model.get('sendToCloud')) {
                            //this.model.set('displayText',' Send in: ' + (period / 1000).toFixed(1) + 's');
                            this.model.set('displayText',' Send in: ' + (period / 1000).toFixed(1) + 's');
                        }
                        this.lastTimeDiff = 0;
                    } else if (timeDiff - this.lastTimeDiff >= 0.1) {
                        //this.model.set('displayText',' Send in: ' + ((period - timeDiff) / 1000).toFixed(1) + 's');
                        this.model.set('displayText',' Send in: ' + ((period - timeDiff) / 1000).toFixed(1) + 's');
                        this.lastTimeDiff = timeDiff;
                    }
                } 
            } else {
                this.lastSendToCloud = false;
            }
        }

	});
});
