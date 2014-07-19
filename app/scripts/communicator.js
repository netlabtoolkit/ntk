define([
	'backbone',
	'backbone.marionette',
	'SocketAdapter',
],
function( Backbone, Marionette, SocketAdapter ) {
    'use strict';

	var Communicator = Backbone.Marionette.Controller.extend({
		initialize: function( options ) {
			var self = this;

			// create a pub sub
			this.mediator = new Backbone.Wreqr.EventAggregator();

			//create a req/res
			this.reqres = new Backbone.Wreqr.RequestResponse();

			// create commands
			this.command = new Backbone.Wreqr.Commands();

			// Bind to a socket server
			// TODO: Hack to make sure that window.app.vent is defined before binding. Fix this.
			window.setTimeout(function() {
				self.socketAdapter = new SocketAdapter();
			}, 500);
		},
	});

	return new Communicator();
});
