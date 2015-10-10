module.exports = function(options) {

	//var domain = require('domain');


	var express = require('express');
		_ = require('underscore'),
		http = require('http'),
		path = require('path'),
		fs = require('fs'),
		events = require('events'),
		formidable = require('formidable');

	app = express();

	events.EventEmitter.call(this);
	_.extend(this, events.EventEmitter.prototype);

		var port = options.port || '9001';
		this.port = port;



		//// simple log
		app.use(function(req, res, next){
			console.log('%s %s', req.method, req.url);
			next();
		});


		app.use(express.static( path.join( __dirname, '../../dist') ));
		app.use('/server', express.static( path.join( __dirname, '../../dist') ));
		app.use(express.static( path.join( __dirname, '../../.tmp') ));

		this.server = http.createServer(app);

		app.get('/patch.ntk', function(req, res){
			res.sendfile( path.join( __dirname, '../nlMultiClientSync/currentPatch.ntk' ) );
		});

		var self = this;

		// Receive a file from the client and load it as a patch
		app.post('/loadPatch', function(req, res, next) {

			var form = new formidable.IncomingForm();

			form.parse(req, function(err, fields, files) {
				res.writeHead(200, {'content-type': 'text/plain'});
				res.write('received upload\n\n');

				fs.readFile(files.patch.path, 'utf8', function (err, data) {

					if (err) {
						console.log('Error: ' + err);
						return;
					}

					var loadedPatch = data;
					self.emit('loadPatch', { patch: JSON.parse(loadedPatch) });
				});
			res.end();
			});
		});

		app.get('/devTools', function(req, res){
			res.send('');
			//res.sendfile( path.join( __dirname, '../../devTools/cssrefresh.js' ) );
		});
		app.get('/client', function(req, res){
			console.log('Client connected');
			self.emit('clientConnected');
			res.sendfile( path.join( __dirname, '../../dist/index.html' ) );
		});
		app.get('*', function(req, res){
			res.sendfile( path.join( __dirname, '../../dist/index.html' ) );
		});
		app.get('/server', function(req, res){
			res.sendfile( path.join( __dirname, '../../dist/index.html' ) );
		});
		app.get('/test', function(req, res){
			console.log(req, res);
		});
		

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
