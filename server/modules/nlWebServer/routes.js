
var createRouter = (server) => {
	var express = require("express"),
		_ = require('underscore'),
		http = require('http'),
		path = require('path'),
		fs = require('fs'),
		os = require('os'),
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
		res.end('');
		//res.sendfile( path.join( __dirname, '../../devTools/cssrefresh.js' ) );
	});

	// Lets the Add Widgets panel tell the user what to type into another
	// device's browser to reach this same patch (see ToolBar_tmpl.js's
	// .patchUrlInfo) - the client can't know this machine's own LAN-facing
	// address itself (window.location.hostname is only useful once you're
	// ALREADY on that address). Picks the first non-internal IPv4 address
	// across all network interfaces - on a machine with more than one
	// active interface (e.g. WiFi + Ethernet) this may not be the specific
	// one a given remote device can actually reach, but it's a reasonable
	// single best guess without asking the user to pick.
	router.get('/localNetworkInfo', function(req, res){
		var interfaces = os.networkInterfaces();
		var address = null;

		Object.keys(interfaces).some(function(name) {
			return interfaces[name].some(function(iface) {
				if(iface.family === 'IPv4' && !iface.internal) {
					address = iface.address;
					return true;
				}
				return false;
			});
		});

		res.json({localIp: address});
	});

	// Streams a media file from anywhere on the local machine, chosen via the
	// native file picker (see server/preload.js + electronApp.js's pick-*-file
	// IPC handlers) - lets Video/Audio/Image widgets reference a file outside
	// server/assets without rebuilding/repackaging the app. Local desktop app,
	// single user, so an absolute-path query param is an acceptable tradeoff;
	// still checked against an extension whitelist and confirmed to exist first.
	var localFileRoute = function(extensions) {
		return function(req, res) {
			var filePath = req.query.path;

			if (!filePath || !extensions.includes(path.extname(filePath).toLowerCase())) {
				return res.status(400).send('Invalid file path');
			}

			fs.stat(filePath, function(err, stats) {
				if (err || !stats.isFile()) {
					return res.status(404).send('File not found');
				}

				res.sendFile(filePath);
			});
		};
	};

	router.get('/localVideo', localFileRoute(['.mp4', '.mov', '.m4v', '.webm', '.ogv']));
	router.get('/localAudio', localFileRoute(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac']));
	router.get('/localImage', localFileRoute(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp']));


	router.get('*', function(req, res){
		res.sendfile( path.join( __dirname, '../../dist/index.html' ) );
	});

	router.get('/server', function(req, res){
		res.sendfile( path.join( __dirname, '../../dist/index.html' ) );
	});

	return router;
};

module.exports = createRouter;
