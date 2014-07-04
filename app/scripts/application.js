define([
	'backbone',
	'communicator',
	'routers/Main',
	'modules/Patcher',
],

function( Backbone, Communicator, MainRouter, PatcherModule ) {
    'use strict';


	var App = new Backbone.Marionette.Application();

	// Regions
	App.addRegions({
		patcherRegion: '#patcherRegion',
		toolBar: '#toolBar',
	});

	App.module('Patcher', PatcherModule);

	//var logMessage = console.log;
	var hubConnect = function(initConnect, finishConnect, serverType, option) {
		var hubPort;
		if (serverType == undefined) serverType = "Hub";
		if (serverType == "Hub") hubPort = "51001";
		else if (serverType == "LeapMotion") hubPort = "6437";
		console.log("hubConnect: " + serverType);

		if (option == undefined) option = 0;

		if (serverType == "galileo") {
			var thisObject = self;
			thisObject.connectionComplete = true;
			//logMessage(thisObject.get('widgetType') + ":" + thisObject.get('name') + " Connected to: " + initConnect,'status');
			thisObject.timerGalileo=setInterval(function(){
				thisObject.httpGet(initConnect, thisObject);
			},50);

		} else if("WebSocket" in window) {
			console.log('Connecting...',"status");
			try {
				var thisObject = self,
					HubIP = "127.0.0.1";
				var ws = new WebSocket("ws://" + HubIP + ":" + hubPort + "/");
				console.log(ws);

				ws.onopen = function(event) {
					console.log("socket open");
					if (initConnect != null) thisObject.ws.send(initConnect);
				}

				ws.onmessage = function(event) {
					if (serverType == "LeapMotion") {
						var obj = JSON.parse(event.data);
						// use "option" to select which pointables to use
						//var str = JSON.stringify(obj, undefined, 2);
						if (obj && thisObject.isDefined(obj.pointables) && thisObject.isDefined(obj.pointables[option])) {
							var x = (obj.pointables[option].tipPosition[0] + 225) * 3;
							var y = (((obj.pointables[option].tipPosition[1]) * -1) + 300) * 3;
							var z = obj.pointables[option].tipPosition[2];
							var values = x + "," + y + "," + z;
							thisObject.processValue(x, values);
						}
					} else {
						var value = event.data.split(" ")[1];

						if (value == "OK") {
							if (finishConnect != null) {
								// send connection completion message if needed
								thisObject.ws.send(finishConnect);
							}
							thisObject.connectionComplete = true;
							console.log('finishConnect message: ' + finishConnect);
							//logMessage(thisObject.get('widgetType') + ":" + thisObject.get('name') + " Connected to: " + event.data.split(" ")[2],"status");
						} else if (value == "FAIL") {
							thisObject.stopSocket();
							console.log(event.data,"status");
						} else {
							value *= thisObject.get('multiplier');
							thisObject.processValue(parseInt(value));
						}
					}
				}

				ws.onclose = function(event) {
					//document.getElementById('status').innerHTML = "closed";
				}

				ws.onerror = function(event) {
					console.log("Error: " + event.data,"status");
				}
			} catch(exception) {
				 console.log('IS THE NETLAB TOOLKIT HUB RUNNING? Error'+exception,"status");
			}
		} else {
			console.log("THIS BROWSER DOES NOT SUPPORT WEBSOCKETS - PLEASE USE AN HTML5 COMPLIENT BROWSER", "status");
		}

	};

	var self = hubConnect;
	var hubInitConnect = "/service/arduino/reader-writer/connect " + "/dev/cu.usb*";
	var hubFinishConnect = "/service/arduino/reader-writer/poll /{" + "/dev/cu.usb*" + "}/analogin/" + 80 + " 0 " + 24;
	//hubConnect(hubInitConnect, hubFinishConnect, "Hub", 80);


	// Initializers
	App.addInitializer( function () {
		//document.body.innerHTML = welcomeTmpl({ success: "CONGRATS!" });
		Communicator.mediator.trigger("APP:START");
		App.mainRouter = new MainRouter();
		Backbone.history.start();
	});

	return App;
});
