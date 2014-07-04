define([
	'application',
	'backbone',
	'socketIO',
	'views/composite/Widgets',
	'collections/Widgets',
	'models/ArduinoUno',
],
function(app, Backbone, socketIO, WidgetsView, WidgetsCollection, ArduinoUnoModel){
    'use strict';

	var widgetsCollection = new WidgetsCollection();
	var arduinoModel = new ArduinoUnoModel();
	widgetsCollection.add(arduinoModel);
	widgetsCollection.models.push(arduinoModel);


	var Patcher = function PatcherConstructor(Patcher, Parent) {
		this.views = {
			mainCanvas: new WidgetsView({ collection: widgetsCollection }),
		};

		this.Controller = {
			attachViews: function() {
				window.io = socketIO.connect('http://localhost:9000');

				Parent.patcherRegion.show(this.views.mainCanvas);
			},
		};

		this.addInitializer(this.Controller.attachViews);
	};

	return Patcher;
});
