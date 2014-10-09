module.exports = function(options) {

	//var domain = require('domain');
	var port = options.port || '9001',
		device = options.device;


		var express = require('express');
		http = require('http'),
		path = require('path'),
		socketIO = require('socket.io');

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
		app.get('/test', function(req, res){
			console.log(req, res);
		});
	};

	WebServer.prototype = {
		start: function() {
			this.server.listen(this.port, function(){
				console.log('Express App started!');
			});

			this.initSockets();
		},
		initSockets: function() {
			this.io = socketIO.listen(this.server);
			device.setTransport(this.io);
		},
	}

	return new WebServer();
};
