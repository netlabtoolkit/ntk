define([
	'backbone',
	'models/Hardware',
],
function( Backbone, HardwareModel ) {
    'use strict';

    /**
     * Client-side proxy for one MQTT broker connection (see
     * server/modules/nlHardware/CloudModel.js) - kept in sync purely so
     * every connected browser client displays the same live topic
     * values, same role models/OSC.js and models/Network.js play for
     * their own hardware types.
     *
     * Unlike OSC.js (one fixed shared default instance, matched by its
     * bare 'OSC' type) or Network.js (a fixed enumerable pin list known
     * ahead of time), a Cloud instance is one of potentially several -
     * different CloudIn/CloudOut widgets can each point at a genuinely
     * different broker - and its topics are arbitrary user-chosen
     * strings, not a fixed pin set. So this needs its own specific
     * "Cloud:<host>:<port>" key (passed as a constructor option by
     * Patcher.js's getHardwareModelInstance) to only react to
     * Widget:hardwareSwitch events meant for THIS broker, and grows its
     * inputs/outputs dicts dynamically instead of pre-declaring them.
     *
     * @return
     */
	var Cloud = HardwareModel.extend({

		initialize: function initialize(attributes, options) {
			HardwareModel.prototype.initialize.call(this);

			this.modelServerKey = options && options.modelServerQuery;

			window.app.vent.on('Widget:hardwareSwitch', function(switchOptions) {
				if(switchOptions.deviceType !== this.modelServerKey) {
					return;
				}

				if(switchOptions.mode === 'out') {
					if(this.get('outputs')[switchOptions.port] === undefined) {
						this.get('outputs')[switchOptions.port] = 0;
					}
				}
				else if(switchOptions.mode === 'in') {
					if(this.get('inputs')[switchOptions.port] === undefined) {
						this.get('inputs')[switchOptions.port] = 0;
						this.set(switchOptions.port, 0);
					}
				}
			}.bind(this));
		},
		defaults: {
			type: "Cloud",
			inputs: {},
			outputs: {},
		},

    });

	return Cloud;
});
