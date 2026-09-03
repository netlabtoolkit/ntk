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
					if(options.hasInput === false) {
						if(this.get('outputs')[options.port] == undefined) {
							this.get('outputs')[options.port] = 0;
						}
					}
					else if(options.hasInput === true) {
						if(this.get('inputs')[options.port] == undefined) {
							this.get('inputs')[options.port] = 0;
							this.set(options.port, 0);
						}
					}
				}
			}.bind(this));
		},
		defaults: {
			type: "OSC",
			inputs: {
				'/ntk/in/1': 0,
				'/ntk/in/2': 0,
				'/ntk/in/3': 0,
				'/ntk/in/4': 0,
				'/ntk/in/5': 0,
				'/ntk/in/6': 0,
				'/ntk/in/7': 0,
				'/ntk/in/8': 0,
				'/ntk/in/9': 0,
				'/ntk/in/10': 0,
				'/ntk/in/11': 0,
				'/ntk/in/12': 0,
				'/ntk/in/13': 0,
				'/ntk/in/14': 0,
			},
			outputs: {
				'/ntk/out/1:127.0.0.1:57120': 0,
				'/ntk/out/2:127.0.0.1:57120': 0,
				'/ntk/out/3:127.0.0.1:57120': 0,
				'/ntk/out/4:127.0.0.1:57120': 0,
				'/ntk/out/5:127.0.0.1:57120': 0,
				'/ntk/out/6:127.0.0.1:57120': 0,
				'/ntk/out/7:127.0.0.1:57120': 0,
				'/ntk/out/8:127.0.0.1:57120': 0,
				'/ntk/out/9:127.0.0.1:57120': 0,
				'/ntk/out/10:127.0.0.1:57120': 0,
				'/ntk/out/11:127.0.0.1:57120': 0,
				'/ntk/out/12:127.0.0.1:57120': 0,
				'/ntk/out/13:127.0.0.1:57120': 0,
				'/ntk/out/14:127.0.0.1:57120': 0,
			},
			'/ntk/in/1': 0,
			'/ntk/in/2': 0,
			'/ntk/in/3': 0,
			'/ntk/in/4': 0,
			'/ntk/in/5': 0,
			'/ntk/in/6': 0,
			'/ntk/in/7': 0,
			'/ntk/in/8': 0,
			'/ntk/in/9': 0,
			'/ntk/in/10': 0,
			'/ntk/in/11': 0,
			'/ntk/in/12': 0,
			'/ntk/in/13': 0,
			'/ntk/in/14': 0,
			'/ntk/out/1:127.0.0.1:57120': 0,
			'/ntk/out/2:127.0.0.1:57120': 0,
			'/ntk/out/3:127.0.0.1:57120': 0,
			'/ntk/out/4:127.0.0.1:57120': 0,
			'/ntk/out/5:127.0.0.1:57120': 0,
			'/ntk/out/6:127.0.0.1:57120': 0,
			'/ntk/out/7:127.0.0.1:57120': 0,
			'/ntk/out/8:127.0.0.1:57120': 0,
			'/ntk/out/9:127.0.0.1:57120': 0,
			'/ntk/out/10:127.0.0.1:57120': 0,
			'/ntk/out/11:127.0.0.1:57120': 0,
			'/ntk/out/12:127.0.0.1:57120': 0,
			'/ntk/out/13:127.0.0.1:57120': 0,
			'/ntk/out/14:127.0.0.1:57120': 0,
		},

    });

	return OSC;
});
