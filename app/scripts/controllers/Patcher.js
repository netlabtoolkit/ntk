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
	'views/CustomFilter',
],
function(app, Backbone, WidgetsView, WidgetsCollection, ArduinoUnoModel, Models, AnalogInView, AnalogOutView, ElementControlView, CustomFilterView){

	var PatcherController = function(region) {
		this.parentRegion = region;
		this.views.mainCanvas = new WidgetsView();

		//window.app.vent.on('ToolBar:addWidget', this.onExternalAddWidget, this);
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
		hardwareModelInstances: {},
		/**
		 * Add the main view to the parent region
		 *
		 * @return
		 */
		attachMainViews: function() {
			var serverAddress = window.location.host;
			window.socketIO = window.io.connect(serverAddress);

			this.parentRegion.show(this.views.mainCanvas);

			// MANUALLY CREATING VIEWS FOR TESTING ////////////////////////////
			//var analogInView = new AnalogInView({
				//inputMapping: 'A0',
			//});
			//this.addWidgetToStage(analogInView)
				//.mapToModel({
					//view: analogInView,
					//modelType: 'ArduinoUno',
					//IOMapping: 'in',
					//server: serverAddress,
				//});

			//var analogOutView = new AnalogOutView({
				//inputMapping: 'out',
				//outputMapping: 'out9',
			//});

			//this.addWidgetToStage(analogOutView)
				//.mapToModel({
					//view: analogOutView,
					//IOMapping: 'out',
					//modelType: 'ArduinoUno',
					//server: serverAddress,
				//});

			//var customFilterView = new CustomFilterView();
			//this.addWidgetToStage(customFilterView);

			//////////////////////////////////////////////////////////////////
			// prototype view adding
			var self = this;
			this.views.mainCanvas.$el.on('click', function(e) {
				if(e.metaKey) {
					var imageSrc = prompt('enter an image URL');
					if(!imageSrc) {
						imageSrc = 'http://payload294.cargocollective.com/1/4/130420/8181648/bDSC_1134.jpg';
					}
					var elementControlView = new ElementControlView({
						src: imageSrc,
					});
					self.addWidgetToStage(elementControlView);

					//var elementControlView = new ElementControlView({
						//src: imageSrc,
					//});
					//self.addWidgetToStage(elementControlView);
				}
			});
			window.app.vent.on('ToolBar:addWidget', this.onExternalAddWidget, this);
		},
		onExternalAddWidget: function(widgetType) {
			var newWidget,
				serverAddress = window.location.host;

			if(widgetType === 'elementControl') {
				var imageSrc = prompt('enter an image URL');
				if(!imageSrc) {
					imageSrc = 'http://payload294.cargocollective.com/1/4/130420/8181648/bDSC_1134.jpg';
				}
				var newWidget = new ElementControlView({
					src: imageSrc,
				});
			}
			else if(widgetType === 'analogIn') {
				var newWidget = new AnalogInView({
					inputMapping: 'A0',
				});

				this.mapToModel({
					view: newWidget,
					modelType: 'ArduinoUno',
					IOMapping: 'in',
					server: serverAddress,
				});
			}
			else if(widgetType === 'analogOut') {
				var newWidget = new AnalogOutView({
					inputMapping: 'out',
					outputMapping: 'out9',
				});

				this.mapToModel({
					view: newWidget,
					IOMapping: 'out',
					modelType: 'ArduinoUno',
					server: serverAddress,
				});
			}
			else if(widgetType === 'expression') {
				var newWidget = new CustomFilterView();
			}

			this.addWidgetToStage(newWidget);
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
				model = options.model,
				IOMapping = options.IOMapping,
				view = options.view,
				server = options.server,
				modelServerQuery = modelType + ":" + server;

			if(IOMapping === 'in') {
				var modelPropertyName = 'sourceModel';
			}
			else {
				var modelPropertyName = 'destinationModel';
			}

			if(model) {
				view[modelPropertyName] = model;
			}
			else {
				if(this.hardwareModelInstances[modelServerQuery]) {
					view[modelPropertyName] = this.hardwareModelInstances[modelServerQuery].model;
				}
				else {
					var newModelInstance = new Models[modelType]();
					this.hardwareModelInstances[modelServerQuery] = {
						model: newModelInstance,
						server: server,
					};

					view[modelPropertyName] = newModelInstance;
				}
			}
			// render the view to reassociate bindings and update any changes
			view.render();

			return this;
		},
	};

	return PatcherController;
});
