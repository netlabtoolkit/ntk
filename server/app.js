'use strict';

var express = require('express');
var http = require('http');
var app = express();
var path = require('path');
var hbs = require('express-hbs');

var five = require("johnny-five");

var board = five.Board();

// stop gap to handle when no board is plugged in. Will switch to domain when we setup a proper server
process.on('uncaughtException', function(err) {
	  console.log('Caught exception: ' + err);
});

	//// simple log
	app.use(function(req, res, next){
	  console.log('%s %s', req.method, req.url);
	  next();
	});

	//// mount static
	app.use(express.static( path.join( __dirname, '../app') ));
	app.use(express.static( path.join( __dirname, '../.tmp') ));


	//// route index.html
	app.get('/', function(req, res){
	  res.sendfile( path.join( __dirname, '../app/index.html' ) );
	});


	//// start server
	var server = http.createServer(app);

	var socketIO = require('socket.io');
	var io = socketIO.listen(server);
	var sensor,
		servo;

	var _ = require('underscore'),
		events = require('events');

	var ArduinoUnoModel = function(attributes) {
		events.EventEmitter.call(this);

		_.extend(this, {
			get: function(field) {
				return this[field];
			},
			set: function(field, value) {
				this[field] = value;
				this.emit('change', {field: field, value: this[field]});
				return ;
			},
			A0: 0,
			A1: 0,
			out9: 0,
		});

		_.extend(this, attributes);
	};

	ArduinoUnoModel.prototype.__proto__ = events.EventEmitter.prototype;

	board.on("ready", function() {
		// Create a new `sensor` hardware instance.
		sensor = new five.Sensor({
			pin: "A0",
			//freq: 80
			freq: 100,
		});
		servo = five.Servo({
			pin: 9,
			range: [0,170],
			//range: [0,1023],
		});

		board.repl.inject({
			sensor: sensor
		});

		io.on('connection', function(socket){
			console.log('a user connected');

			// Create the arduino uno instance
			var arduinoModel = new ArduinoUnoModel();
			arduinoModel.on('change', function(options) {
				if(options.field !== 'out9') {
					socket.emit('receivedModelUpdate', {modelType: 'ArduinoUno', field: options.field, value: options.value});
				}
			});

			var hardwareModels = {
				ArduinoUno: arduinoModel,
			};


			socket.on('sendModelUpdate', function(options) {
				hardwareModels[options.modelType].set('out9', parseInt(options.model.out9, 10));
			});
			arduinoModel.on('change', function(options) {
				if(options.field === 'out9') {
					servo.to(options.value);
				}
			});

			sensor.scale([0, 1023]).on("data", function() {
				arduinoModel.set('A0', Math.floor(this.value));
			});

		});
	});
	server.listen(9001, function(){
		console.log('Express App started!');
	});


