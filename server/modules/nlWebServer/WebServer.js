module.exports = function(options) {

	var port = options.port || '9001';


	var express = require('express');
	var http = require('http');
	var app = express();
	var path = require('path');

	var WebServer = function() {
		this.port = port;
		//// simple log
		app.use(function(req, res, next){
			console.log('%s %s', req.method, req.url);
			next();
		});

		app.use(express.static( path.join( __dirname, '../app') ));
		app.use(express.static( path.join( __dirname, '../.tmp') ));

		this.server = http.createServer(app);

		app.get('/', function(req, res){
			res.sendfile( path.join( __dirname, '../app/index.html' ) );
		});
		app.get('/test', function(req, res){
			console.log(req, res);
		});
	};

	WebServer.prototype = {
		start: function() {
			this.server.listen(this.port, function(){
				console.log('Express App started!');
			});
		},
	}

	return new WebServer();
};
