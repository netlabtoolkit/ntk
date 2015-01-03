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
	'views/WidgetMap',
	'models/WidgetConfig',
	'views/AnalogIn/AnalogIn',
	'views/AnalogOut/AnalogOut',
	'views/Image/Image',
	'views/Code/Code',
	'views/Blank/Blank',
    'views/Servo/Servo',
    'views/Splitter/Splitter',
],
function(app, Backbone, CableManager, PatchLoader, TimingController, WidgetsView, WidgetsCollection, ArduinoUnoModel, Models, Widgets, WidgetModel, AnalogInView, AnalogOutView, ImageView, CodeView, BlankView, ServoView,SplitterView){

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
			window.app.vent.on('receivedDeviceModelUpdate', function(data) {
				var serverAddress = window.location.host;
				//var hardwareModel = this.getHardwareModelInstance(data.modelType, serverAddress);
				var hardwareModel = this.hardwareModelInstances[data.modelType + ':' + serverAddress];

				hardwareModel && hardwareModel.model.set(data.field, data.value);
			}, this);

			window.app.cableManager = new CableManager();
			$(window.app.cableManager.parentEl).css({top: 0, left: 0, position: 'absolute', width: '100%', height: '100%'});
			window.app.vent.on('Widget:removeMapping', this.removeMapping, this);


			window.app.vent.on('updateWidgetModelFromServer', this.updateWidgetModelFromServer, this);
		},
		onExternalAddWidget: function(widgetType, addedFromLoader) {
			var newWidget,
				serverAddress = window.location.host;

			var newModel = new WidgetModel();
			this.widgetModels.add(newModel);

			if(widgetType) {

				// Special cases for Hardware interfacing widgets for now
				if(widgetType === 'AnalogIn') {
					var newWidget = new AnalogInView({
						model: newModel,
						inputMapping: 'A0',
					});

					this.mapToModel({
						view: newWidget,
						modelType: 'ArduinoUno',
						IOMapping: {sourceField: "A0", destinationField: 'in'},
						server: serverAddress,
					}, addedFromLoader);
				}
				else if(widgetType === 'AnalogOut') {
					var newWidget = new AnalogOutView({
						model: newModel,
						outputMapping: 'D3',
					});

					this.addWidgetToStage(newWidget, addedFromLoader);

					this.mapToModel({
						view: newWidget,
						IOMapping: {sourceField: "out", destinationField: 'D3'},
						modelType: 'ArduinoUno',
						server: serverAddress,
					}, addedFromLoader);

					return newWidget;
				}
                else if(widgetType === 'Servo') {
					var newWidget = new ServoView({
						model: newModel,
						outputMapping: 'D9',
					});

					this.addWidgetToStage(newWidget, addedFromLoader);

					this.mapToModel({
						view: newWidget,
						IOMapping: {sourceField: "out", destinationField: 'D9'},
						modelType: 'ArduinoUno',
						server: serverAddress,
					}, addedFromLoader);

					return newWidget;
                }
				else {
					var newWidget = new Widgets[widgetType]({
						model: newModel,
					});
				}


				this.addWidgetToStage(newWidget, addedFromLoader);

				return newWidget;
			}

			return false;
		},
		/**
		 * Render a view to the appropriate Canvas DOM element
		 *
		 * @param view
		 * @return {object} this controller
		 */
		addWidgetToStage: function(view, addedFromLoader) {
			this.views.mainCanvas.addView(view);
			this.widgets.push(view);
			if(!view.model.get('wid')) {
				view.model.set('wid', view.model.cid);
			}
			if(!addedFromLoader) {
				window.app.vent.trigger('addWidget', view.model);
			}
			this.widgetModels.add(view.model);
			this.bindModelToServer(view.model);


			return view;
		},
        /**
         * updateWidgetModelFromServer
         *
         * @param {object} changedWidgets 
         * @return {void}
         */
		updateWidgetModelFromServer: function(changedWidgets) {
			var wid, changedAttributes;
			for(var i=changedWidgets.length-1; i >= 0; i--) {

				var widget = changedWidgets[i];
				wid = widget.wid;
				if(widget.changedAttributes) {
					changedAttributes = widget.changedAttributes;
				}


				// If we find the model in our collection to update, set its attributes with the changes
				var modelToUpdate = this.widgetModels.where({wid: wid});
				if(modelToUpdate.length) {
					var trigger = true;
					if(window.app.server) { trigger = false;}
					modelToUpdate[0].set(changedAttributes, {updateNoTrigger: trigger});
				}
			}

		},
		bindModelToServer: function(model) {
			model.on('change', function(model, options){
				if(options.updateNoTrigger !== true) {
					window.app.vent.trigger('widgetUpdate', {wid: model.get('wid'), changedAttributes: model.changedAttributes()});
				}
			});
		},
        /**
         * remove a widget from the array of widgets that we are tracking
         *
         * @param {WidgetMulti} widgetView
         * @return {void}
         */
		removeWidget: function(widgetView, calledFromLoader) {
			this.widgets = _.reject(this.widgets, function(view) { return widgetView === view; });
			this.widgetModels.remove(widgetView.model);


			if(!calledFromLoader) {
				window.app.vent.trigger('removeWidget', widgetView.model.get( 'wid' ));
			}
		},
		/**
		 * Assign a model to a view, instantiating the model if one is not instantiated yet
		 * All models are singletons since we are only communicating with one
		 *
		 * @param {object} options
		 * @return {Backbone.View} the view that was passed in
		 */
		mapToModel: function(options, addedFromLoader) {

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
					from: {x: model.get('offsetLeft') + inletOffsets.source.x, y: model.get('offsetTop') + inletOffsets.source.y},
					to: {x: view.model.get('offsetLeft') + inletOffsets.destination.x, y: view.model.get('offsetTop') + inletOffsets.destination.y},
				});
				view.addCable(cable, model, inletOffsets, IOMapping);
			}
			else {
				var sourceModel = this.getHardwareModelInstance(modelType, server);
				var mappingObject = {
					model: sourceModel,
					map: IOMapping,
				};
			}
			// Pass the mapping to the view. The view will handle the event binding
			view.addInputMap(mappingObject);
			var modelWID = mappingObject.model.get('wid');

			if(view) {
				viewWID = view.model.get('wid');
			}

			if(modelWID) {
				this.widgetMappings.push({
					viewWID: viewWID,
					map: mappingObject.map,
					modelWID: modelWID,
					offsets: inletOffsets,
				});
			}
			else {
				this.widgetMappings.push({
					viewWID: viewWID,
					map: mappingObject.map,
					modelWID: modelType,
					offsets: inletOffsets,
				});
			}

			// render the view to reassociate bindings and update any changes
			view.render();
			if(!addedFromLoader) {
				window.app.vent.trigger('updateModelMappings', this.widgetMappings);
			}


			return this;
		},
		removeMapping: function(mapping) {
			this.widgetMappings.splice(this.widgetMappings.indexOf(mapping), 1);
			window.app.vent.trigger('updateModelMappings', this.widgetMappings);
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

				// Only the server can update hardware
				if(window.app.server) {
					newModelInstance.on('change', function(model) {
						var changedAttributes = model.changedAttributes();
						// Check all the changed attributes
						for(attribute in changedAttributes) {
							// and see if the attribute exists in the outputs section of this model
							if(newModelInstance.attributes.outputs[attribute] !== undefined) {
								window.app.vent.trigger('sendModelUpdate', {modelType: modelType, model: model});
							}
						}
					});
				}

				return newModelInstance;
			}
		},


		loadPatch: function(JSONString) {
			for(var i=this.widgets.length-1; i>=0; i--) {
				// (event, calledFromLoader)
				this.widgets[i].removeWidget(null, true);
			}

			this.widgets.length = 0;
			this.patchLoader.loadJSON(JSONString);
		},
		savePatch: function() {
			this.patchLoader.save(this.widgetModels, this.widgetMappings);
			window.app.vent.trigger('savePatchToServer', {collection: this.widgetModels, mappings: this.widgetMappings});
		},
	};

	return PatcherController;
});
