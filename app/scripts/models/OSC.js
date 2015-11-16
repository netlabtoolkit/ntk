define([
	'backbone',
	'models/Hardware',
],
function( Backbone, HardwareModel ) {
    'use strict';

    /**
     * OSC Model containing OSC specific properties and defaults
     *
     * @return
     */
	var OSC = HardwareModel.extend({

		initialize: function initialize() {
			window.app.vent.on('Widget:hardwareSwitch', function(options) {
				if(options.deviceType == this.get('type') ) {
					if(this.get('outputs')[options.port] == undefined) {
						this.get('outputs')[options.port] = 0;
					}
				}
			}.bind(this));
		},
		defaults: {
			type: "OSC",
			inputs: {
				ntkReceiveMsg: 0,
			},
			outputs: {
				ntkSendMsg: 0,
			},
			ntkReceiveMsg: 0,
			ntkSendMsg: 0,
		},

    });

	return OSC;
});
