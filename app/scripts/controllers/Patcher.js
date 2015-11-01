define([
	'application',
	'backbone',
	'communicator',
	'SocketAdapter',
	'cableManager',
	'controllers/PatchLoader',
	'controllers/Timing',
	'views/composite/Widgets',
	'collections/Widgets',
	'models/ArduinoUno',
	'models/ModelMap',
	'views/WidgetMap',
	'models/WidgetConfig',
	'models/OSC',
	'views/AnalogIn/AnalogIn',
	'views/AnalogOut/AnalogOut',
	'views/Image/Image',
	'views/Code/Code',
	'views/Blank/Blank',
    'views/Servo/Servo',
    'views/OSCIn/OSCIn',
    'views/OSCOut/OSCOut',
    'views/Splitter/Splitter',
    'views/item/RestrictiveOverlay',
],
function(app, Backbone, Communicator, SocketAdapter, CableManager, PatchLoader, TimingController, WidgetsView, WidgetsCollection, ArduinoUnoModel, Models, Widgets, WidgetModel, OSCModel, AnalogInView, AnalogOutView, ImageView, CodeView, BlankView, ServoView, OSCInView, OSCOutView, SplitterView, RestrictiveOverlayView){

	var PatcherController = function(region) {
		this.parentRegion = region;
		this.views.mainCanvas = new WidgetsView();
		this.widgetModels = new WidgetsCollection();
		this.hardwareModelInstances = {};

		// Create a patch loader / saver for reloading in JSON "patches"
		this.patchLoader = new PatchLoader({
			serverAddress: 'localhost',
			//addFunction: (function(self) { return function() {return self.onExternalAddWidget.apply(self, arguments)}; })(this),
			addFunction: this.onExternalAddWidget.bind(this),
			//mapFunction: (function(self) { return function() {return self.mapToModel.apply(self, arguments)}; })(this),
			mapFunction: this.mapToModel.bind(this),
		});

		window.OO = this;
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
			// Bind to a socket server
			Communicator.socketAdapter = new SocketAdapter();

			if(this.parentRegion) {
				this.parentRegion.show(this.views.mainCanvas);
				$('#patcherRegion').append(new RestrictiveOverlayView().render().el);
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
			window.app.vent.on('ToolBar:clearPatch', this.clearPatch, this);
			window.app.vent.on('receivedDeviceModelUpdate', function(data) {
				data = JSON.parse(data);
				var serverAddress = window.location.host;
				//var hardwareModel = this.getHardwareModelInstance(data.modelType, serverAddress);
				var hardwareModel = this.hardwareModelInstances[data.modelType + ':' + serverAddress];

				hardwareModel && hardwareModel.model.set(data.field, data.value);
			}, this);

			window.app.cableManager = new CableManager();
			$(window.app.cableManager.parentEl).css({top: 0, left: 0, position: 'absolute', width: '100%', height: '100%'});
			window.app.vent.on('Widget:removeMapping', this.removeMappingFromWidget, this);


			window.app.vent.on('updateWidgetModelFromServer', this.updateWidgetModelFromServer, this);
			window.app.vent.on('updateWidgetMappingFromServer', this.updateWidgetMappingFromServer, this);

		},
		onExternalAddWidget: function(widgetType, addedFromLoader, wid) {
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

					this.addWidgetToStage(newWidget, addedFromLoader);

					if(!addedFromLoader) {
						this.mapToModel({
							view: newWidget,
							modelType: 'ArduinoUno',
							IOMapping: {sourceField: "A0", destinationField: 'in'},
							server: serverAddress,
						}, addedFromLoader);
					}


					return newWidget;
				}
				else if(widgetType === 'AnalogOut') {
					var defaultMapping = 'D3';

					// Check if we are already using this output pin, don't use it if we are
					var existingMapping = _.find(this.widgetMappings, function(map) {
						return map.map.destinationField === defaultMapping;
					});
					var defaultOutputMapping = existingMapping ? '' : defaultMapping;

					var newWidget = new AnalogOutView({
						model: newModel,
						outputMapping: defaultOutputMapping,
					});

					this.addWidgetToStage(newWidget, addedFromLoader);

					if(!addedFromLoader) {

						this.mapToModel({
							view: newWidget,
							IOMapping: {sourceField: "out", destinationField: defaultOutputMapping},
							modelType: 'ArduinoUno',
							server: serverAddress,
						}, addedFromLoader);
					}

					return newWidget;
				}
                else if(widgetType === 'Servo') {
					var defaultMapping = 'D9';
					// Check if we are already using this output pin, don't use it if we are
					var existingMapping = _.find(this.widgetMappings, function(map) {
						return map.map.destinationField === defaultMapping;
					});
					var defaultOutputMapping = existingMapping ? '' : defaultMapping;

					var newWidget = new ServoView({
						model: newModel,
						outputMapping: defaultOutputMapping,
					});

					this.addWidgetToStage(newWidget, addedFromLoader);

					if(!addedFromLoader) {
						this.mapToModel({
							view: newWidget,
							IOMapping: {sourceField: "out", destinationField: defaultMapping},
							modelType: 'ArduinoUno',
							server: serverAddress,
						}, addedFromLoader);
					}

					return newWidget;
                }
                else if(widgetType === 'OSCIn') {
					var newWidget = new OSCInView({
						model: newModel,
						inputMapping: 'ntkReceiveMsg',
					});

					this.addWidgetToStage(newWidget, addedFromLoader);

					if(!addedFromLoader) {
						this.mapToModel({
							view: newWidget,
							modelType: 'OSC',
							IOMapping: {sourceField: "ntkReceiveMsg", destinationField: 'in'},
							server: serverAddress,
						}, addedFromLoader);
					}

					return newWidget;
                }
                else if(widgetType === 'OSCOut') {
					var newWidget = new OSCOutView({
						model: newModel,
						outputMapping: 'ntkSendMsg',
					});

					this.addWidgetToStage(newWidget, addedFromLoader);

					if(!addedFromLoader) {
						this.mapToModel({
							view: newWidget,
							IOMapping: {sourceField: "out", destinationField: "ntkSendMsg"},
							modelType: 'OSC',
							server: serverAddress,
						}, addedFromLoader);
					}

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
					//if(window.app.server) { trigger = false;}
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
		updateWidgetMappingFromServer: function updateWidgetMappingFromServer(mapping) {
			var widgetView = _.find(this.widgets, function(view) {
				return view.model.get('wid') == mapping.modelWID;
			});

			if(widgetView) {
				var sourceMap = widgetView.sources[0];

				sourceMap.map.destinationField = mapping.map.destinationField;
				sourceMap.map.sourceField = mapping.map.sourceField;
			}
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

			// Get any mappings related to this widget
			var widgetID = widgetView.model.get('wid');
			var relatedMappings = _.filter(this.widgetMappings, function(mapping) {
				return (mapping.modelWID == widgetID || mapping.viewWID == widgetID);
			});

			// Remove each related mapping found
			for(var i=relatedMappings.length-1; i>=0; i--) {
				this.removeMapping(relatedMappings[i], widgetView.model.get('wid'));
			}

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

			// If we have a view, grab its wid
			if(view) {
				viewWID = view.model.get('wid');
			}

			if(model) {
				var mappingObject = {
					model: model,
					map: IOMapping,
				};

				if(inletOffsets) {
					// Create a new patch cable between the source widget and this widget's inlet
					var cable = window.app.cableManager.createConnection({
						from: {x: model.get('offsetLeft') + inletOffsets.source.x, y: model.get('offsetTop') + inletOffsets.source.y},
						to: {x: view.model.get('offsetLeft') + inletOffsets.destination.x, y: view.model.get('offsetTop') + inletOffsets.destination.y},
					});


					var sourceViewID = undefined;

					for(var i=this.widgets.length-1; i>=0; i--) {
						if(this.widgets[i].model.cid == model.cid) {
							sourceViewID = this.widgets[i].cid;
						}
					}
					view.addCable(cable, model, inletOffsets, IOMapping, sourceViewID);

					model.on('remove destroy', function() {
						view.removeCable(cable);
					});
				}

				// ViewWID listens to ModelWID
				var modelWID = mappingObject.model.get('wid');
				this.widgetMappings.push({
					viewWID: viewWID,
					map: mappingObject.map,
					modelWID: modelWID,
					offsets: inletOffsets,
				});
			}
			// If we don't have a model, it means we are using a "hardware model" so get one of those and use it
			else {
				var sourceModel = this.getHardwareModelInstance(modelType, server);
				var mappingObject = {
					model: sourceModel,
					map: IOMapping,
				};
				//var modelWID = view.model.get('wid');
				this.widgetMappings.push({
					viewWID: viewWID,
					map: mappingObject.map,
					modelWID: modelType,
					offsets: inletOffsets,
				});
			}

			
			// Pass the mapping to the view. The view will handle the event binding
			if(view) {
				view.addInputMap(mappingObject);


				// render the view to reassociate bindings and update any changes
				view.render();
				if(!addedFromLoader) {
					window.app.vent.trigger('updateModelMappings', this.widgetMappings);
				}
			}


			return this;
		},
		/**
		 * Remove a mapping when it is triggered by a widget. Widgets have less access to the info we need to accurately remove a mapping so we search
		 *
		 * @param {object} mapping the mapping passed from the widget
		 * @param {string} wid the WID of the widget which is being unmapped
		 * @return {undefined}
		 */
		removeMappingFromWidget: function removeMappingFromWidget(mapping, wid) {
			var widgetMap = _.find(this.widgetMappings, function(widgetMapping) {
				return widgetMapping.viewWID == wid
					&& widgetMapping.map.destinationField == mapping.map.destinationField
					&& widgetMapping.map.sourceField == mapping.map.sourceField
			});

			this.removeMapping(widgetMap);
		},
		/**
		 * Remove a mapping from the widgetMappings array
		 *
		 * @param {object} mapping the mapping to remove
		 * @return {undefined}
		 */
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
				//if(window.app.server) {
					newModelInstance.on('change', function(model) {
						var changedAttributes = model.changedAttributes();
						// Check all the changed attributes
						for(attribute in changedAttributes) {
							// and see if the attribute exists in the outputs section of this model
							if(newModelInstance.attributes.outputs[attribute] !== undefined) {
								window.app.vent.trigger('sendDeviceModelUpdate', {modelType: modelType, model: model});
							}
						}
					});
				//}
				return newModelInstance;
			}
		},


		loadPatch: function(JSONString, save) {
			// Remove all previous mappings and widgets
			this.widgetMappings.length = 0;
			for(var i=this.widgets.length-1; i>=0; i--) {
				// (event, calledFromLoader)
				this.widgets[i].removeWidget(null, true);
			}
			this.widgets.length = 0;

			// Call patchloader to handle creating new widgets/mappings
			this.patchLoader.loadJSON(JSONString, save);
		},
		savePatch: function() {
			window.app.vent.trigger('savePatchToServer', {collection: this.widgetModels, mappings: this.widgetMappings});
		},
		clearPatch: function() {
			var emptyPatch = {"widgets":[],"mappings":[]};

			window.app.vent.trigger('clearPatch', {patch: emptyPatch });
			//this.loadPatch(JSON.stringify(emptyPatch), false);
		},
	};

	return PatcherController;
});
