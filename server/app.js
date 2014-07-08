'use strict';

var express = require('express');
var http = require('http');
var app = express();
var path = require('path');
//var async = require('async');
var hbs = require('express-hbs');
//var baucis = require('baucis');
//var mongoose = require('mongoose');

var five = require("johnny-five");

var board = five.Board();

// stop gap to handle when no board is plugged in. Will switch to domain when we setup a proper server
process.on('uncaughtException', function(err) {
	  console.log('Caught exception: ' + err);
});

// start mongoose
//mongoose.connect('mongodb://localhost/sit');
//var db = mongoose.connection;

//db.on('error', console.error.bind(console, 'connection error:'));
//db.once('open', function callback () {

	//[> test schema <]
    //var testSchema = new mongoose.Schema({
        //test: String
    //});

    //var Test = mongoose.model( 'test', testSchema );

    //[> set Baucis <]
    //baucis.rest({
        //singular: 'test'
    //});

	//var app = express();

	//app.configure(function(){
		//app.set('port', 9000);

		//app.set('view engine', 'handlebars');
		//app.set('views', __dirname + '../app/scripts/views');
	//});

    //app.use('/api/v1', baucis());

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
	board.on("ready", function() {
		// Create a new `sensor` hardware instance.
		sensor = new five.Sensor({
			pin: "A0",
			freq: 80
		});
		servo = five.Servo({
			pin: 9,
			range: [0,170],
		});

		board.repl.inject({
			sensor: sensor
		});

		//sensor.scale([0, 100]).on("data", function() {
			//console.log('A0', this.value );
			//socket.emit('A0', Math.floor(this.value));
		//});

		io.on('connection', function(socket){
			console.log('a user connected');

			socket.on('blink', function(value) {
				console.log('blink!!!!');

				var led = new five.Led({
					pin: 11,
				});

				led.pulse(value);

			});

			socket.on('out9', function(value) {
				servo.to(value);
			});

			sensor.scale([0, 100]).on("data", function() {
				socket.emit('A0', Math.floor(this.value));
			});

		});
	});
	server.listen(9001, function(){
		console.log('Express App started!');
	});



//});


