module.exports = function(options) {
	// Last resort
	process.on('uncaughtException', (err) => {
		console.log('error:', err, new Error().stack);
	});

	var express = require('express');
		_ = require('underscore'),
		http = require('http'),
		path = require('path'),
		fs = require('fs'),
		events = require('events'),
		formidable = require('formidable'),
		router = require("./routes");


	events.EventEmitter.call(this);
	_.extend(this, events.EventEmitter.prototype);

	var port = options.port || '9001';
	this.port = port;


	app = express();

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
				// A test launch (NTK_SCRATCH_PATCH, see CLAUDE.md) with
				// another NTK already running can't get the port - and
				// its window then loads from the running NTK's server
				// and edits that patch, not the scratch one (2026-11-05:
				// a test widget landed in the user's open patch). Quit
				// instead.
				server.on('error', function(err) {
					if(err.code === 'EADDRINUSE' && process.env.NTK_SCRATCH_PATCH) {
						console.error('NTK test launch: port ' + port + ' is in use - another NTK is running. Quitting so this window cannot edit its patch.');
						process.exit(1);
					}
				});
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
