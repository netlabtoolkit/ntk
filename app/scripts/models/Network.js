define([
	'backbone',
	'models/Hardware',
],
function( Backbone, HardwareModel ) {
    'use strict';

    /**
     * Client-side proxy for a Firmata device reached over a network
     * transport (WiFi/TCP) - kept in sync with the server-side model
     * (see server/modules/nlHardware/NetworkModel.js) purely so every
     * connected browser client displays the same live pin values.
     *
     * @return
     */
	var NetworkDevice = HardwareModel.extend({

		// Need to update for separated inputs/outputs
		defaults: {
			type: "network",
			A0: 0,
			A1: 0,
			A2: 0,
			A3: 0,
			A4: 0,
			A5: 0,
			D1: 0,
			D2: 0,
			D3: 0,
			D4: 0,
			D5: 0,
			D6: 0,
			D7: 0,
			D8: 0,
			D9: 0,
			D10: 0,
			D11: 0,
			D12: 0,
			D13: 0,
			inputs: {
				A0: 0,
				A1: 0,
				A2: 0,
				A3: 0,
				A4: 0,
				A5: 0,
				D1: 0,
				D2: 0,
				D3: 0,
				D4: 0,
				D5: 0,
				D6: 0,
				D7: 0,
				D8: 0,
				D9: 0,
				D10: 0,
				D11: 0,
				D12: 0,
				D13: 0,
			},
			outputs: {
				D3: 0,
				D4: 0,
				D5: 0,
				D6: 0,
				D7: 0,
				D8: 0,
				D9: 0,
				D10: 0,
				D11: 0,
				D12: 0,
				D13: 0,
			},
		},

    });

	return NetworkDevice;
});
