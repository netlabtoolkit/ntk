define([
	'application',
	'backbone',
	'views/composite/Widgets',
	'collections/Widgets',
	'models/ArduinoUno',
	'models/ModelMap',
	'views/AnalogIn',
	'views/AnalogOut',
	'views/ElementControl',
],
function(app, Backbone, WidgetsView, WidgetsCollection, ArduinoUnoModel, Models, AnalogInView, AnalogOutView, ElementControlView){

	var PatcherController = function(region) {
		this.parentRegion = region;
		this.views.mainCanvas = new WidgetsView();
	};

	PatcherController.prototype = {
		/**
		 * All structural views associated with this module
		 *
		 * @return {object}
		 */
		views: {},
		/**
		 * All currently active widgets
		 *
		 * @return {Array}
		 */
		widgets: [],
		destinationModelInstances: {},
		/**
		 * Add the main view to the parent region
		 *
		 * @return
		 */
		attachMainViews: function() {
			var serverAddress = window.location.host;
			//window.io = socketIO.connect(serverAddress);
			window.socketIO = window.io.connect(serverAddress);

			this.parentRegion.show(this.views.mainCanvas);

			var analogInView = new AnalogInView({
				inputMapping: 'A0',
			});
			this.addWidgetToStage(analogInView);
			// app.Patcher.Controller.mapToModel({view: app.Patcher.Controller.widgets[0], modelType: 'ArduinoUno', server: 'localhost:9000'});
			this.addWidgetToStage(analogInView).mapToModel({
				view: analogInView,
				modelType: 'ArduinoUno',
				server: serverAddress,
			});

			var elementControlView = new ElementControlView({
				inputMapping: 'in',
			});

			this.addWidgetToStage(elementControlView).mapToModel({
				view: elementControlView,
				model: analogInView.model,
			});
			var analogOutView = new AnalogOutView({
				outputMapping: 'out9',
			});
			this.addWidgetToStage(analogOutView).mapToModel({
				view: analogOutView,
				modelType: 'ArduinoUno',
				server: serverAddress,
			});
		},
		/**
		 * Render a view to the appropriate Canvas DOM element
		 *
		 * @param view
		 * @return {object} this controller
		 */
		addWidgetToStage: function(view) {
			this.views.mainCanvas.addView(view);
			this.widgets.push(view);
			return this;
		},
		/**
		 * Assign a model to a view, instantiating the model if one is not instantiated yet
		 * All models are singletons since we are only communicating with one
		 *
		 * @param {object} options
		 * @return {Backbone.View} the view that was passed in
		 */
		mapToModel: function(options) {

			var modelType = options.modelType,
				destinationModel = options.model,
				view = options.view,
				server = options.server,
				modelServerQuery = modelType + ":" + server;

			if(destinationModel) {
				view.destinationModel = destinationModel;
			}
			else {
				if(this.destinationModelInstances[modelServerQuery]) {
					view.destinationModel = this.destinationModelInstances[modelServerQuery].model;
				}
				else {
					var newModelInstance = new Models[modelType]();
					this.destinationModelInstances[modelServerQuery] = {
						model: newModelInstance,
						server: server,
					};

					view.destinationModel = newModelInstance;
				}
			}
			// render the view to reassociate bindings and update any changes
			view.render();

			return view;
		},
	};

	return PatcherController;
});
