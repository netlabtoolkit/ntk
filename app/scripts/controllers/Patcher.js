define([
	'application',
	'backbone',
	'cableManager',
	'views/composite/Widgets',
	'collections/Widgets',
	'models/ArduinoUno',
	'models/ModelMap',
	'views/AnalogIn',
	'views/AnalogOut',
	'views/ElementControl',
	'views/CustomFilterMulti',
	'views/Blank',
],
function(app, Backbone, CableManager, WidgetsView, WidgetsCollection, ArduinoUnoModel, Models, AnalogInView, AnalogOutView, ElementControlView, CustomFilterView, BlankView){

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
		initialize: function() {
			this.attachMainViews();
		},
		/**
		 * Add the main view to the parent region
		 *
		 * @return
		 */
		attachMainViews: function() {
			//var serverAddress = window.location.host;
			//window.socketIO = window.io.connect(serverAddress);

			if(this.parentRegion) {
				this.parentRegion.show(this.views.mainCanvas);
			}

			this.addEventListeners();
		},
        /**
         * add all event listeners for objects this controller is managing
         *
         * @return {void}
         */
		addEventListeners: function() {
			window.app.vent.on('ToolBar:addWidget', this.onExternalAddWidget, this);
			window.app.vent.on('receivedModelUpdate', function(data) {
				var serverAddress = window.location.host;
				var hardwareModel = this.getHardwareModelInstance(data.modelType, serverAddress);

				hardwareModel.set(data.field, data.value);
			}, this);

			window.app.cableManager = new CableManager();
			$(window.app.cableManager.parentEl).css({top: 0, left: 0, position: 'absolute', width: '100%', height: '100%'});
		},
		onExternalAddWidget: function(widgetType) {
			var newWidget,
				serverAddress = window.location.host;

			if(widgetType === 'elementControl') {
				var imageSrc = prompt('enter an image URL');
				if(!imageSrc) {
					//imageSrc = 'http://payload294.cargocollective.com/1/4/130420/8181648/bDSC_1134.jpg';
					imageSrc = 'images/pinkBlue.jpg';
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
					//IOMapping: 'in',
					IOMapping: {sourceField: "A0", destinationField: 'in'},
					server: serverAddress,
				});
			}
			else if(widgetType === 'analogOut') {
				var newWidget = new AnalogOutView({
					outputMapping: 'out9',
				});

				this.mapToModel({
					view: newWidget,
					//IOMapping: 'out',
					IOMapping: {sourceField: "out", destinationField: 'out9'},
					modelType: 'ArduinoUno',
					server: serverAddress,
				});
			}
			else if(widgetType === 'expression') {
				var newWidget = new CustomFilterView();
			}
			else if(widgetType === 'blank') {
				var newWidget = new BlankView();
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
         * remove a widget from the array of widgets that we are tracking
         *
         * @param {WidgetMulti} widgetView
         * @return {void}
         */
		removeWidget: function(widgetView) {
			this.widgets = _.reject(this.widgets, function(view) { console.log(widgetView, view); return widgetView === view; });
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
				server = options.server;


			//if(IOMapping === 'in') {
				//var modelPropertyName = 'sourceModel';
				////var modelPropertyName = 'sourceModels';
			//}
			//else {
				//var modelPropertyName = 'destinationModel';
				////var modelPropertyName = 'destinationModels';
			//}

			if(model) {
				//view[modelPropertyName] = model;
				var mappingObject = {
					model: model,
					map: IOMapping,
				};

				//view.addInputMap(mappingObject);
			}
			else {
				//view.sourceModel = this.getHardwareModelInstance(modelType, server);
				var sourceModel = this.getHardwareModelInstance(modelType, server);
				var mappingObject = {
					model: sourceModel,
					map: IOMapping,
				};
				//view[modelPropertyName].push(this.getHardwareModelInstance(modelType, server) );
			}
			view.addInputMap(mappingObject);
			// render the view to reassociate bindings and update any changes
			view.render();

			return this;
		},
        /**
         * Get the singleton model:server instance and if it does not yet exist, create it and return it
         *
         * @param {string} modelType
         * @param {string} server
         * @return {HardwareModel}
         */
		getHardwareModelInstance: function(modelType, server) {

			var modelServerQuery = modelType + ":" + server;

			if(this.hardwareModelInstances[modelServerQuery]) {
				return this.hardwareModelInstances[modelServerQuery].model;
			}
			else {
				var newModelInstance = new Models[modelType]();
				this.hardwareModelInstances[modelServerQuery] = {
					model: newModelInstance,
					server: server,
				};
				// Loop
				newModelInstance.on('change', function(model) {
					//console.log(model.changedAttributes());
					if(model.changedAttributes().out9) {
						window.app.vent.trigger('sendModelUpdate', {modelType: modelType, model: model});
					}
				});

				return newModelInstance;
			}
		},
	};

	return PatcherController;
});
