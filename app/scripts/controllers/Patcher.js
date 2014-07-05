define([
	'application',
	'backbone',
	'socketIO',
	'views/composite/Widgets',
	'collections/Widgets',
	'models/ArduinoUno',
	'models/ModelMap',
],
function(app, Backbone, socketIO, WidgetsView, WidgetsCollection, ArduinoUnoModel, Models){

	var PatcherController = function(region) {
		this.parentRegion = region;
		var widgetsCollection = new WidgetsCollection();
		var arduinoModel = new ArduinoUnoModel();

		widgetsCollection.add(arduinoModel);
		widgetsCollection.models.push(arduinoModel);

		this.views.mainCanvas = new WidgetsView({ collection: widgetsCollection });
	};

	PatcherController.prototype = {
		/**
		 * All structural views associated with this module
		 *
		 * @return {object}
		 */
		views: {},
		/**
		 * Add the main view to the parent region
		 *
		 * @return
		 */
		attachMainViews: function() {
			window.io = socketIO.connect('http://localhost:9000');

			this.parentRegion.show(this.views.mainCanvas);
		},
		/**
		 * All currently active widgets
		 *
		 * @return {Array}
		 */
		widgets: [],
		/**
		 * Render a view to the appropriate Canvas DOM element
		 *
		 * @param view
		 * @return
		 */
		addWidgetToStage: function(view) {
			this.views.mainCanvas.el.appendChild(view.render().el);
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
				view = options.view,
				server = options.server,
				modelServerQuery = modelType + ":" + server;

			if(this.activeModels[modelServerQuery]) {
				view.model = this.modelInstances[modelServerQuery].model;
			}
			else {
				var newModelInstance = new Models[modelType]();
				this.modelInstances[modelServerQuery] = {
					model: newModelInstance,
					server: server,
				};

				view.model = newModelInstance;
			}

			return view;
		},
	};

	return PatcherController;
});
