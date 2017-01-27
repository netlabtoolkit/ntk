module.exports = function(options) {

	//var domain = require('domain');


	var express = require('express');
		_ = require('underscore'),
		http = require('http'),
		path = require('path'),
		fs = require('fs'),
		events = require('events'),
		formidable = require('formidable'),
		expressDomain = require("express-domain-middleware"),
		router = require("./routes");


	events.EventEmitter.call(this);
	_.extend(this, events.EventEmitter.prototype);

	var port = options.port || '9001';
	this.port = port;


	app = express();

	// SAFETY!
	app.use(expressDomain);
	// Setup routes
	app.use(router(this));

	this.server = http.createServer(app);

	WebServer = {
		/**
		 * start the server listening and return a Promise
		 *
		 * @return {Promise}
		 */
		start: function() {
			var server = this.server,
				port = this.port;

			return new Promise(function(resolve, reject) {
				server.listen(port, function(){
					console.log('Webserver has started!');

					resolve(server);
				});
			});
		},
	}


	_.extend(this, WebServer);
	return this;
};
