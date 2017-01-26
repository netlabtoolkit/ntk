
var createRouter = (server) => {
	var express = require("express"),
		_ = require('underscore'),
		http = require('http'),
		path = require('path'),
		fs = require('fs'),
		events = require('events'),
		formidable = require('formidable');


	var router = express.Router();

	//// simple log
	router.use(function(req, res, next){
		console.log('%s %s', req.method, req.url);
		next();
	});

	var assetDir = "../../assets";

	router.use(express.static( path.join( __dirname, '../../dist') ));
	router.use('/assets', express.static( path.join( __dirname, assetDir) ));
	router.use('/server', express.static( path.join( __dirname, '../../dist') ));
	router.use(express.static( path.join( __dirname, '../../.tmp') ));


	router.get('/patch.ntk', function(req, res){
		// send file from GET "patch" parameter - should probably change this to a PUT
		res.set({'Content-Disposition': 'attachment; filename=\"patch.ntk\"','Content-type': 'application/octet-stream'});
		res.send(decodeURIComponent(req.query.patch));
	});

	var self = server;

	// Receive a file from the client and load it as a patch
	router.post('/loadPatch', function(req, res, next) {

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

	router.get('/devTools', function(req, res){
		res.send('');
		//res.sendfile( path.join( __dirname, '../../devTools/cssrefresh.js' ) );
	});


	router.get('*', function(req, res){
		res.sendfile( path.join( __dirname, '../../dist/index.html' ) );
	});

	router.get('/server', function(req, res){
		res.sendfile( path.join( __dirname, '../../dist/index.html' ) );
	});

	return router;
};

module.exports = createRouter;
