define([
	'backbone',
	'models/Hardware',
],
function( Backbone, HardwareModel ) {
    'use strict';

    /**
     * Client-side stand-in for one command station session (see
     * server/modules/nlHardware/WiThrottleModel.js), so a DCC widget can
     * be mapped to it like any other hardware and the server keeps the
     * session open while the widget is on. The widget reads the
     * station's reports itself (receivedDeviceModelUpdate), so this only
     * needs to exist - empty outputs keep Patcher from forwarding any of
     * its changes back to the server.
     *
     * @return
     */
	var WiThrottle = HardwareModel.extend({
		initialize: function initialize(attributes, options) {
			HardwareModel.prototype.initialize.call(this);
			this.modelServerKey = options && options.modelServerQuery;
			this.set({inputs: {}, outputs: {}});
		},
		defaults: {
			type: "WiThrottle",
		},
    });

	return WiThrottle;
});
