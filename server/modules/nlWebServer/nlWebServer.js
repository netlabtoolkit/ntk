module.exports = function(options) {

	//var domain = require('domain');
	var port = options.port || '9001',
		device = options.device;


	var express = require('express');
		http = require('http'),
		path = require('path');

		app = express();

	var WebServer = function() {
		this.port = port;

		//// simple log
		app.use(function(req, res, next){
			console.log('%s %s', req.method, req.url);
			next();
		});

		app.use(express.static( path.join( __dirname, '../../../app') ));
		app.use(express.static( path.join( __dirname, '../../../.tmp') ));

		this.server = http.createServer(app);

		app.get('/', function(req, res){
			res.sendfile( path.join( __dirname, '../app/index.html' ) );
		});
		app.get('/server', function(req, res){
			res.sendfile( path.join( __dirname, '../../app/index.html' ) );
		});
		app.get('/test', function(req, res){
			console.log(req, res);
		});
	};

	WebServer.prototype = {
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

	return new WebServer();
};
