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
			'change #getFromCloud': 'getFromCloud',
		},
		// typeID us the unique ID for this widget. It must be a unique name as these are global.
		typeID: 'CloudIn',
		className: 'cloudIn',
		template: _.template(Template),

		initialize: function(options) {
			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);

            // Call any custom DOM events here
            this.model.set({
                title: 'CloudIn',
                getPeriod: 10000,
                publicKey: 'your-public-key',
                dataField: 'mydata',
                getFromCloud: false,
                displayText: "Stopped",
            });
            
            // private variables
            this.startTime = 0;
            this.lastSendToCloud = false;
            this.lastTimeDiff = 0;
            this.startCountdown = true;

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
        
        getFromCloud: function(e) {
            if (!this.model.get('sendToCloud')) {
                this.model.set('displayText',"Stopped");
            }
        },
        
        onModelChange: function(model) {
            if(!window.app.server) {
                if (model.changedAttributes().displayText) {
                    var displayText = this.model.get('displayText');
                    this.$('.timeLeft').text(displayText);

                    if (parseInt(displayText.substring(8))*1000 >= this.model.get('getPeriod')) {
                        if (this.startCountdown) {
                            console.log("countdown");
                            this.$('.outvalue').css('color','#ff0000');
                            this.$('.outvalue').animate({color: '#000000' },this.model.get('getPeriod') - 500,'swing');
                            this.startCountdown = false;
                        }
                    } else {
                        this.startCountdown = true;
                    }
                } 
                
                if (model.changedAttributes().in) {
                    this.$('.dial').val(this.model.get('in')).trigger('change');
                }  
                
                

            } 
        },
        
        timeKeeper: function(frameCount) {
            var self = this;
            if (this.model.get('getFromCloud')) {
                if(window.app.server) {
                    var period = this.model.get('getPeriod');
                    
                    if (this.lastSendToCloud == false) { // starting to send to cloud
                        this.startTime = Date.now() - (period + 1) ;
                        this.lastSendToCloud = true;
                        //console.log("reset");
                    }
                    
                    var timeDiff = Date.now() - this.startTime;
                    
                    
                    if (timeDiff > period) { // get from cloud
                        //console.log("getting");
                        var theValue = (this.model.get('out')).toString();
                        var pubKey = this.model.get('publicKey');
                        var dataField = this.model.get('dataField');
                        var url = 'https://data.sparkfun.com/output/' + pubKey + '.json';
						$.ajax({
							url: url,
							jsonp: 'callback',
							cache: false,
							dataType: 'jsonp',
							data: {
								page: 1
							},
							success: function(response) {
								// check for success
								if (response.success == false) {
									console.log( "Connection to cloud service failed");
									self.model.set('getFromCloud',false);
									self.model.set('displayText',"Couldn't connect");
								} else {
                                    var value = Number(response[0][dataField]);
                                    if (isNaN(value)) {
                                        self.model.set('getFromCloud',false);
                                        self.model.set('displayText',"Bad datafield");
                                    } else {
								        self.model.set('in',Number(response[0][dataField]));
                                    }
								}
							},

							fail: function( jqxhr, textStatus, error ) {
								var err = textStatus + ", " + error;
								console.log( "Connection to cloud servive failed: " + err );
								self.model.set('getFromCloud',false);
								self.model.set('displayText',"Couldn't connect");
							}
						});
                        
                        this.startTime = Date.now();
                        this.inputCount = 0;
                        this.inputCumulative = 0;
                        this.model.set('displayText','Get in: ' + (period / 1000).toFixed(1) + 's');
                        this.lastTimeDiff = 0;
                    } else if (timeDiff - this.lastTimeDiff >= 0.1) {
                        this.model.set('displayText',' Get in: ' + ((period - timeDiff) / 1000).toFixed(1) + 's');
                        this.lastTimeDiff = timeDiff;
                    }
                } 
            } else {
                this.lastSendToCloud = false;
            }
        }

	});
});
