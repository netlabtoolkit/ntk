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
                privateKey: 'your-private-key',
                publicKey: 'your-public-key',
                dataField: 'mydata',
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
        
        sendToCloud: function(e) {
            if(!window.app.server) {
                if (!this.model.get('sendToCloud')) {
                    this.model.set('displayText',"Stopped");
                }
            }
        },
        
        onModelChange: function(e) {
            if(!window.app.server) {
                var keys = _.keys(e.changedAttributes());
                //console.log(test);
                if (keys.indexOf("displayText") >= 0) {
                    this.$('.timeLeft').text(this.model.get('displayText'));
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
                        //console.log("sending");
                        var theValue = (this.model.get('out')).toString();
                        var pubKey = this.model.get('publicKey');
                        var priKey = this.model.get('privateKey');
                        var dataField = this.model.get('dataField');
                        var url = 'https://data.sparkfun.com/input/' + pubKey + '?private_key=' + priKey + '&' + dataField + '=' + theValue;
						$.getJSON(url)
                            .done(function( json ) {
                                //console.log( "JSON Data: " + JSON.stringify(json) );
                            })
                            .fail(function( jqxhr, textStatus, error ) {
                                var err = textStatus + ", " + error;
                                console.log( "Connection to cloud servive failed: " + err );
                                self.model.set('sendToCloud',false);
                                self.model.set('displayText',"Couldn't connect");
						});
                        this.startTime = Date.now();
                        this.inputCount = 0;
                        this.inputCumulative = 0;
                        if (this.model.get('sendToCloud')) {
                            this.model.set('displayText',' Send in: ' + (period / 1000).toFixed(1) + 's');
                        }
                        this.lastTimeDiff = 0;
                    } else if (timeDiff - this.lastTimeDiff >= 0.1) {
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
