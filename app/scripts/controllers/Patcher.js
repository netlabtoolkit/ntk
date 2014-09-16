define([
	'application',
	'backbone',
	'cableManager',
	'controllers/PatchLoader',
	'controllers/Timing',
	'views/composite/Widgets',
	'collections/Widgets',
	'models/ArduinoUno',
	'models/ModelMap',
	'models/WidgetConfig',
	'views/AnalogIn',
	'views/AnalogOut',
	'views/ElementControl',
	'views/Code',
	'views/Blank',
],
function(app, Backbone, CableManager, PatchLoader, TimingController, WidgetsView, WidgetsCollection, ArduinoUnoModel, Models, WidgetModel, AnalogInView, AnalogOutView, ElementControlView, CodeView, BlankView){

	var PatcherController = function(region) {
		this.parentRegion = region;
		this.views.mainCanvas = new WidgetsView();
		this.widgetModels = new WidgetsCollection();

		// Create a patch loader / saver for reloading in JSON "patches"
		this.patchLoader = new PatchLoader({
			serverAddress: 'localhost',
			addFunction: (function(self) { return function() {return self.onExternalAddWidget.apply(self, arguments)}; })(this),
			mapFunction: (function(self) { return function() {return self.mapToModel.apply(self, arguments)}; })(this),
		});

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
		widgetMappings: [],
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
			// Create a timing controller for registering frame-based callbacks
			window.app.timingController = new TimingController();

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
			window.app.vent.on('ToolBar:savePatch', this.savePatch, this);
			window.app.vent.on('ToolBar:loadPatch', this.loadPatch, this);
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
			widgetType = widgetType.toLowerCase();

			//var newModel = this.widgetModels.create({});
			var newModel = new WidgetModel();
			this.widgetModels.add(newModel);

			if(widgetType === 'elementcontrol') {
				var imageSrc = prompt('enter an image URL');
				if(!imageSrc) {
					imageSrc = 'images/pinkBlue.jpg';
				}
				var newWidget = new ElementControlView({
					model: newModel,
					src: imageSrc,
				});
			}
			else if(widgetType === 'analogin') {
				var newWidget = new AnalogInView({
					model: newModel,
					inputMapping: 'A0',
				});

				this.mapToModel({
					view: newWidget,
					modelType: 'ArduinoUno',
					IOMapping: {sourceField: "A0", destinationField: 'in'},
					server: serverAddress,
				});
			}
			else if(widgetType === 'analogout') {
				var newWidget = new AnalogOutView({
					model: newModel,
					outputMapping: 'out9',
				});

				this.mapToModel({
					view: newWidget,
					IOMapping: {sourceField: "out", destinationField: 'out9'},
					modelType: 'ArduinoUno',
					server: serverAddress,
				});
			}
			else if(widgetType === 'code') {
				var newWidget = new CodeView({
					model: newModel,
				});
			}
			else if(widgetType === 'blank') {
				var newWidget = new BlankView({
					model: newModel,
				});
			}

			this.addWidgetToStage(newWidget);

			return newWidget;
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
			if(!view.model.get('wid')) {
				view.model.set('wid', view.model.cid);
			}
			this.widgetModels.add(view.model);
			return view;
		},
        /**
         * remove a widget from the array of widgets that we are tracking
         *
         * @param {WidgetMulti} widgetView
         * @return {void}
         */
		removeWidget: function(widgetView) {
			this.widgets = _.reject(this.widgets, function(view) { return widgetView === view; });
			this.widgetModels.remove(widgetView.model);
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
				inletOffsets = options.inletOffsets;

			if(model) {
				var mappingObject = {
					model: model,
					map: IOMapping,
				};

				// Create a new patch cable between the source widget and this widget's inlet
				var cable = window.app.cableManager.createConnection({
					from: {x: model.get('offsetLeft'), y: model.get('offsetTop') + model.get('height')},
					to: {x: view.model.get('offsetLeft'), y: view.model.get('offsetTop')},
				});
				view.addCable(cable, model, inletOffsets);
			}
			else {
				var sourceModel = this.getHardwareModelInstance(modelType, server);
				var mappingObject = {
					model: sourceModel,
					map: IOMapping,
				};
			}
			view.addInputMap(mappingObject);
			var modelWID = mappingObject.model.get('wid');

			if(view) {
				viewWID = view.model.get('wid');
			}

			if(modelWID) {
				this.widgetMappings.push({viewWID: viewWID, map: mappingObject.map, modelWID: modelWID});
			}
			else {
				this.widgetMappings.push({viewWID: viewWID, map: mappingObject.map, modelWID: modelType});
			}

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
					if(model.changedAttributes().out9) {
						window.app.vent.trigger('sendModelUpdate', {modelType: modelType, model: model});
					}
				});

				return newModelInstance;
			}
		},


		loadPatch: function(JSONString) {
			for(var i=this.widgets.length-1; i>=0; i--) {
				this.widgets[i].removeWidget();
			}

			this.widgets.length = 0;
			this.patchLoader.loadJSON(JSONString);
		},
		savePatch: function() {
			this.patchLoader.save(this.widgetModels, this.widgetMappings);
		},
	};

	return PatcherController;
});
