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
                getFromCloud: false,
            });
            
            // private variables
            this.startFrame = 0;

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
        
        timeKeeper: function(frameCount) {
            var self = this;
            if (this.model.get('getFromCloud')) {
                var timeDiff = (frameCount - this.startFrame) * (1000/60);
                var period = this.model.get('getPeriod');
                this.$('.timeLeft').text(' Send in: ' + ((period - timeDiff) / 1000).toFixed(1) + 's');
                if (timeDiff > period) {
                    this.$('.outvalue').css('color','#ff0000');
                    this.$('.outvalue').animate({color: '#000000' },10000,'swing');
                    var pubKey = this.model.get('publicKey');
                    var url = 'https://data.sparkfun.com/output/' + pubKey + '.json';
                    $.ajax({
                        url: url,
                        jsonp: 'callback',
                        cache: true,
                        dataType: 'jsonp',
                        data: {
                            page: 1
                        },
                        success: function(response) {
                            // check for success
                            if (response.success == false) {
                                console.log( "Connection to cloud servive failed");
                                self.model.set('getFromCloud',false);
                                self.$('.timeLeft').text("Couldn't connect");
                            } else {
                                self.model.set('in',Number(response[0].testdata));
                                self.$('.dial').val(Number(response[0].testdata)).trigger('change');
                            }
                        },
                        
                        fail: function( jqxhr, textStatus, error ) {
                            var err = textStatus + ", " + error;
                            console.log( "Connection to cloud servive failed: " + err );
                            self.model.set('getFromCloud',false);
                            self.$('.timeLeft').text("Couldn't connect");
                        }
                    });
                    console.log(timeDiff + " msecs");
                    this.startFrame = frameCount;
                }
            } else {
                this.startFrame = frameCount;
            }
        }

	});
});
