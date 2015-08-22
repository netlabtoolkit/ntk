define([
	'backbone',
    'rivets',
	'views/item/WidgetMulti',
	'text!./template.js',

	// If you would like signal processing classes and functions include them here
	'utils/SignalChainFunctions',
	'utils/SignalChainClasses',
	// and any other imported libraries you like should go here
],
function(Backbone, rivets, WidgetView, Template, SignalChainFunctions, SignalChainClasses){
    'use strict';

	return WidgetView.extend({
        typeID: 'Webhook',
		categories: ['output', 'internet'],
		className: 'webhook',
		template: _.template(Template),
		sources: [],
        widgetEvents: {
			//'change .sendToCloud': 'sendToCloud',
		},

		initialize: function(options) {
			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);

            // Call any custom DOM events here
            this.model.set({
                title: 'Webhook',
                ins: [
                    {title: 'trigger', to: 'trigger'},
                    {title: 'in1', to: 'in1'},
                    {title: 'in2', to: 'in2'},
                    {title: 'in3', to: 'in3'},
                ],
                outs: [
                    {title: 'out', from: 'trigger', to: 'out'},
                ],
                trigger: 0,
                in1: 0,
                in2: 0,
                in3: 0,
                minPeriod: 1000,
                urlTemplate: '',
                urlComputed: '',
                sendToCloud: false,
                displayText: 'Waiting',
                threshold: 512,
                lastInput: '',
                lastSent: 0,
                widgetReady: false,

            });

            // If you want to register your own signal processing function, push them to signalChainFunctions
			this.signalChainFunctions.push(this.watchData);

			// If you would like to register any function to be called at frame rate (60fps)
			//window.app.server && 
			//window.app.timingController.registerFrameCallback(this.timeKeeper, this);
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
            this.model.set('widgetReady', true);

        },


		// Any custom function can be attached to the widget like this "limitServoRange" function
		// and can be accessed via this.limitServoRange();
		onRemove: function() {
			//window.app.timingController.removeFrameCallback(this.timeKeeper, this);
		},
        
        onModelChange: function(model) {
            //console.log("modelChange");
            if (this.model.get('widgetReady')) {
                if(model.changedAttributes().in1 !== undefined 
                   || model.changedAttributes().in2 !== undefined 
                   || model.changedAttributes().in3 !== undefined) {
                    this.computeUrl();
                }
            }                            
        },
        
        watchData: function(input) {
            if(parseFloat(this.model.get('lastInput'),10) < parseFloat(this.model.get('threshold'),10) 
               && parseFloat(input,10) >= parseFloat(this.model.get('threshold'),10) ) {
                this.sendUrl();
            } else if(parseFloat(this.model.get('lastInput'),10) >= parseFloat(this.model.get('threshold'),10) 
               && parseFloat(input,10) < parseFloat(this.model.get('threshold'),10) ) {
                this.model.set('displayText',"Waiting");
            }
            
            this.model.set('lastInput',input);
            return input;
        },
        
        computeUrl: function() {
            var url = this.model.get('urlTemplate');
            url = url.replace(/<1>/g, encodeURIComponent(this.model.get('in1')));
            url = url.replace(/<2>/g, encodeURIComponent(this.model.get('in2')));
            url = url.replace(/<3>/g, encodeURIComponent(this.model.get('in3')));
            
            this.model.set('urlComputed',url);
        },
        
        sendUrl: function() {
            var timeDiff = Date.now() - this.model.get('lastSent');
            if(!this.model.get('sendToCloud')) {
                this.model.set('displayText',"Reconnect");
                return;
            }
            if (this.model.get('urlTemplate').indexOf("http") != 0) {
                this.model.set('displayText',"No URL");
                return;
            }
        
            if(timeDiff < this.model.get('minPeriod')) {
                return;
            }
            
            var self = this;

            if (this.model.get('displayText') != 'Sending') {
                self.model.set('displayText',"Sending");
                setTimeout(function () {
                    // delay slightly to be sure to capture any changes to inputs 
                    // that happened at the same time as the request to send
                    self.model.set('lastSent',Date.now())
                    self.computeUrl();
                    var url = self.model.get('urlComputed');
                    if ((app.server && app.serverMode) || (!app.server && !app.serverMode)) { 
                        // only send if we're the server and in server mode, or the browser and in authoring mode
                        console.log('sending: ' + url);
                        $.getJSON(url)
                            .done(function( json ) {
                                self.model.set('displayText',"Sent");
                                console.log( "JSON Data: " + JSON.stringify(json) );
                            })
                            .fail(function( jqxhr, textStatus, error ) {
                                var err = textStatus + ", " + error;
                                console.log( "Connection to webhook failed: " + err );
                                self.model.set('sendToCloud',false);
                                self.model.set('displayText',"Can't connect");
                        });
                    }
                }, 10);
            }
        },
            
	});
});
