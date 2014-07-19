define([
	'backbone',
	'models/Hardware',
],
function( Backbone, HardwareModel ) {
    'use strict';

    /**
     * ArduinoUno Model containing Arduino Uno specific properties and defaults
     *
     * @return
     */
	var ArduinoUno = HardwareModel.extend({

		defaults: {
			A0: 0,
			A1: 0,
			out9: 0,
		},
		//sync: function(method, model, options) {
				//// {"command":"action", "data":"data sent to the server"}
			////window.io.send(JSON.stringify({"command":model.url, data:model.attributes}));
			//window.socketIO.emit(JSON.stringify({"command":model.url, data:model.attributes}) );

			////ws.onmessage = function(message){
			//window.socketIO.on(model.url, function(message) {
				//// message.data is a property sent by the server
				//// change it to suit your needs
				//var return = JSON.parse(message.data);
				//// executes the success callback when receive a message from the server
				//options.success(return);
			//});
		//},

    });

	return ArduinoUno;
});
