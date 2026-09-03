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
	'views/DigitalIn/DigitalIn',
	'views/DigitalOut/DigitalOut',
	'views/Image/Image',
	'views/Code/Code',
	'views/Blank/Blank',
    'views/Servo/Servo',
    'views/OSCIn/OSCIn',
    'views/OSCOut/OSCOut',
    'views/Splitter/Splitter',
    'views/item/RestrictiveOverlay',
    'views/GroveSensor/GroveSensor',
],
function(app, Backbone, Communicator, SocketAdapter, CableManager, PatchLoader, TimingController, WidgetsView, WidgetsCollection, ArduinoUnoModel, Models, Widgets, WidgetModel, OSCModel, AnalogInView, AnalogOutView, DigitalInView, DigitalOutView, ImageView, CodeView, BlankView, ServoView, OSCInView, OSCOutView, SplitterView, RestrictiveOverlayView, GroveSensorView){

	var PatcherController = function(region) {
		this.parentRegion = region;
		this.views.mainCanvas = new WidgetsView();
		this.widgetModels = new WidgetsCollection();
		this.hardwareModelInstances = {};

		// Grid used to place freshly-placed (not loaded-from-patch)
		// widgets - see placeNewWidget()/findFreeGridSlots(). occupiedSlots
		// maps a slot index to true; widgetSlots maps a widget's wid to the
		// slot indices it holds, so removeWidget() can free exactly those
		// slots again when that widget is individually deleted, instead of
		// only ever noticing when the whole canvas goes empty.
		this.occupiedSlots = {};
		this.widgetSlots = {};

		// Create a patch loader / saver for reloading in JSON "patches"
		this.patchLoader = new PatchLoader({
			//serverAddress: 'localhost',
			serverAddress: '127.0.0.1',
			addFunction: this.onExternalAddWidget.bind(this),
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
		largestCID: 1,
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
			window.app.vent.on('ToolBar:exportPatch', this.exportPatch, this);
			window.app.vent.on('ToolBar:loadPatch', this.loadPatch, this);
			window.app.vent.on('ToolBar:clearPatch', this.clearPatch, this);
			window.app.vent.on('receivedDeviceModelUpdate', function(data) {
				data = JSON.parse(data);

				var hardwareModel = this.hardwareModelInstances[data.modelType];

				hardwareModel && hardwareModel.model.set(data.field, data.value);
				hardwareModel && (hardwareModel.model.active = true);
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

				if(serverAddress == "localhost:9001") {
					serverAddress = "127.0.0.1:9001";
				}

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
						this.applyDefaultDeviceToModel(newModel);
						var deviceMapping = this.getDefaultDeviceMapping(serverAddress);
						this.mapToModel({
							view: newWidget,
							modelType: deviceMapping.modelType,
							IOMapping: {sourceField: "A0", destinationField: 'in'},
							server: deviceMapping.server,
						}, addedFromLoader);
					}


					return newWidget;
				}
				else if(widgetType === 'AnalogOut') {
					var defaultMapping = '';

					var existingMapping = this.existingMappingExists(defaultMapping, "ArduinoUno" );

					// Check if we are already using this output pin, don't use it if we are
					//var existingMapping = _.find(this.widgetMappings, function(map) {
						//return map.map.destinationField === defaultMapping;
					//});

					var defaultOutputMapping = existingMapping ? '' : defaultMapping;

					var newWidget = new AnalogOutView({
						model: newModel,
						outputMapping: defaultOutputMapping,
					});

					this.addWidgetToStage(newWidget, addedFromLoader);

					if(!addedFromLoader) {
						this.applyDefaultDeviceToModel(newModel);
						var deviceMapping = this.getDefaultDeviceMapping(serverAddress);
						this.mapToModel({
							view: newWidget,
							modelType: deviceMapping.modelType,
							IOMapping: {sourceField: "out", destinationField: defaultOutputMapping},
							server: deviceMapping.server,
						}, addedFromLoader);
					}

					return newWidget;
				}
				if(widgetType === 'DigitalIn') {
					var newWidget = new DigitalInView({
						model: newModel,
						inputMapping: 'D12',
					});

					this.addWidgetToStage(newWidget, addedFromLoader);

					if(!addedFromLoader) {
						this.applyDefaultDeviceToModel(newModel);
						var deviceMapping = this.getDefaultDeviceMapping(serverAddress);
						this.mapToModel({
							view: newWidget,
							modelType: deviceMapping.modelType,
							IOMapping: {sourceField: "D12", destinationField: 'in'},
							server: deviceMapping.server,
						}, addedFromLoader);
					}


					return newWidget;
				}
				else if(widgetType === 'DigitalOut') {
					var defaultMapping = '';

					var existingMapping = this.existingMappingExists(defaultMapping, "ArduinoUno" );

					// Check if we are already using this output pin, don't use it if we are
					//var existingMapping = _.find(this.widgetMappings, function(map) {
						//return map.map.destinationField === defaultMapping;
					//});
					var defaultOutputMapping = existingMapping ? '' : defaultMapping;

					var newWidget = new DigitalOutView({
						model: newModel,
						outputMapping: defaultOutputMapping,
					});

					this.addWidgetToStage(newWidget, addedFromLoader);

					if(!addedFromLoader) {
						this.applyDefaultDeviceToModel(newModel);
						var deviceMapping = this.getDefaultDeviceMapping(serverAddress);
						this.mapToModel({
							view: newWidget,
							IOMapping: {sourceField: "out", destinationField: defaultOutputMapping},
							modelType: deviceMapping.modelType,
							server: deviceMapping.server,
						}, addedFromLoader);
					}

					return newWidget;
				}
                else if(widgetType === 'Servo') {
					var defaultMapping = '';
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
						this.applyDefaultDeviceToModel(newModel);
						var deviceMapping = this.getDefaultDeviceMapping(serverAddress);
						this.mapToModel({
							view: newWidget,
							IOMapping: {sourceField: "out", destinationField: defaultMapping},
							modelType: deviceMapping.modelType,
							server: deviceMapping.server,
						}, addedFromLoader);
					}

					return newWidget;
                }
                else if(widgetType === 'OSCIn') {
					var newWidget = new OSCInView({
						model: newModel,
						inputMapping: '/ntk/in/1',
					});

					this.addWidgetToStage(newWidget, addedFromLoader);

					if(!addedFromLoader) {
						// NOT serverAddress (NTK's own web server host) - OSC widgets bind to
						// the actual OSC receiving port (see OSCIn.js/nlHardware/OSC.js), which
						// is unrelated to NTK's own web server address.
						this.mapToModel({
							view: newWidget,
							modelType: 'OSC',
							IOMapping: {sourceField: "/ntk/in/1", destinationField: 'in'},
							server: newWidget.getDeviceServerName() + ":" + newWidget.getDeviceServerPort(),
						}, addedFromLoader);
					}

					return newWidget;
                }
                else if(widgetType === 'OSCOut') {
					var defaultMapping = '/ntk/out/1:127.0.0.1:57120';

					// Check if we are already using this output pin, don't use it if we are
					var existingMapping = _.find(this.widgetMappings, function(map) {
						return map.map.destinationField === defaultMapping;
					});
					var defaultOutputMapping = existingMapping ? '' : defaultMapping;
					//var defaultOutputMapping = defaultMapping;

					var newWidget = new OSCOutView({
						model: newModel,
						outputMapping: defaultOutputMapping,
					});

					this.addWidgetToStage(newWidget, addedFromLoader);

					if(!addedFromLoader) {
						// NOT serverAddress - see getReceivingDeviceKey() in OSCOut.js: this
						// must match OSCIn's default receiving key, not OSCOut's own (outbound
						// target) port, so both share one server-side hardware model instance.
						this.mapToModel({
							view: newWidget,
							IOMapping: {sourceField: "out", destinationField: defaultOutputMapping},
							modelType: 'OSC',
							server: '127.0.0.1:57190',
						}, addedFromLoader);
					}

					return newWidget;
                }
                else if(widgetType === 'GroveSensor') {
					var newWidget = new GroveSensorView({
						model: newModel,
					});

					this.addWidgetToStage(newWidget, addedFromLoader);

					if(!addedFromLoader) {
						// Same Settings > Device default stamping every other
						// hardware widget above gets - a no-op when the
						// default is still Serial (GroveSensor's own model
						// already defaults there via getDeviceModelType()).
						this.applyDefaultDeviceToModel(newModel);

						// Delegates to the widget's own remapSensor() (mapping
						// + subscribe for whichever sensor it defaults to)
						// rather than duplicating that logic here.
						newWidget.remapSensor(newWidget.model.get('sensor'));
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
		 * getDefaultDeviceMapping - the {modelType, server} pair a freshly
		 * placed hardware widget should map to, based on the left panel's
		 * Settings > Device default (window.app.defaultDevice). Falls back
		 * to the existing ArduinoUno/serverAddress behavior when the
		 * default is still Serial, so nothing changes for that case.
		 *
		 * @param {string} fallbackServerAddress the serverAddress used for
		 *   ArduinoUno (NTK's own web server host, not the device address)
		 * @return {object} {modelType, server}
		 */
		getDefaultDeviceMapping: function(fallbackServerAddress) {
			var defaultDevice = window.app.defaultDevice;

			if(defaultDevice && defaultDevice.deviceType === 'network') {
				return {
					modelType: 'network',
					// 192.168.4.1 matches the CircuitPython Firmata firmware's
					// SoftAP mode fixed IP (see firmware/xiao-esp32c6-
					// circuitpython-firmata/code.py's start_ap()) - a
					// reasonable default landing spot now that boards can be
					// reached that way with nothing to discover.
					server: (defaultDevice.server || '192.168.4.1') + ":" + (defaultDevice.port || 3030),
				};
			}

			return {modelType: 'ArduinoUno', server: fallbackServerAddress};
		},
		/**
		 * applyDefaultDeviceToModel - stamp a freshly created widget's model
		 * with the left panel's Device default so its own Device/ip/port
		 * fields show the same thing that's being mapped, instead of
		 * silently mapping to Network while still displaying Serial. A
		 * no-op when the default is still Serial (the widget's own model
		 * already defaults there).
		 *
		 * @param {object} model the new widget's model
		 * @return {void}
		 */
		applyDefaultDeviceToModel: function(model) {
			var defaultDevice = window.app.defaultDevice;

			if(defaultDevice && defaultDevice.deviceType === 'network') {
				model.set({
					deviceType: 'network',
					server: defaultDevice.server,
					port: defaultDevice.port,
				});
			}
		},
		existingMappingExists: function existingMappingExists(port, deviceType) {
			// Check if we are already using this output pin, don't use it if we are
			var existingMapping = _.find(this.widgetMappings, function(map) {
				return map.map.destinationField === port && map.modelWID === deviceType;
			});

			return existingMapping;
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
				//view.model.set('wid', view.model.cid);
				this.largestCID++;
				// adding the c to maintain backwards compatibility
				view.model.set('wid', "n" + this.largestCID);
			}
			// Loaded-from-patch widgets already carry their own saved
			// position (applied via setFromModel) - only freshly-placed
			// widgets need one, so they don't all stack on top of each
			// other at .widget's static CSS default position.
			if(!addedFromLoader) {
				this.placeNewWidget(view);
				window.app.vent.trigger('addWidget', view.model);
			}
			this.widgetModels.add(view.model);
			this.bindModelToServer(view.model);


			return view;
		},
		WIDGETS_WITH_DETACHED_DISPLAY: ['Button', 'Knob', 'Video', 'Image', 'Text'],
		// Image/Video's detached display is a preview that can be
		// arbitrarily large (whatever image/video was loaded) - reserving
		// grid space to avoid ever overlapping it isn't worth it, and it's
		// fine for a new widget to land on top of one. Button/Knob's
		// displays are small and fixed-size, so those still reserve room.
		WIDGETS_RESERVING_EXTRA_GRID_SPACE: ['Button', 'Knob'],
		// Vertical offset from a widget's own box to its detached display,
		// per typeID - Text/Image/Video sit 5px lower than Button/Knob.
		DETACHED_DISPLAY_TOP_OFFSET: {
			Button: 150,
			Knob: 150,
			Video: 155,
			Image: 155,
			Text: 155,
		},
		GRID_STEP_X: 200,
		GRID_STEP_Y: 190,
		GRID_START_LEFT: 120,
		GRID_START_TOP: 50,
		/**
		 * getGridColumns - how many grid columns fit in the canvas right
		 * now (recomputed each time in case the window's been resized).
		 * The Add Widgets panel (app/styles/toolBar.scss) is
		 * position:fixed, 250px wide, docked over the right edge of
		 * #patcherRegion rather than shrinking it - #patcherRegion's own
		 * width doesn't know it's there, so it's subtracted here to keep
		 * new widgets from landing underneath it.
		 *
		 * @return {number}
		 */
		getGridColumns: function() {
			var ADD_WIDGETS_PANEL_WIDTH = 250,
				canvasWidth = ($('#patcherRegion').width() || 900) - ADD_WIDGETS_PANEL_WIDTH;

			return Math.max(1, Math.floor((canvasWidth - this.GRID_START_LEFT) / this.GRID_STEP_X));
		},
		/**
		 * findFreeGridSlots - the first (row-major, top-left to
		 * bottom-right) block of unoccupied grid cells big enough for a
		 * widthxheight footprint, without wrapping mid-row.
		 *
		 * @param {number} width footprint width in grid cells
		 * @param {number} height footprint height in grid cells
		 * @return {Array} occupied slot indices, top-left cell first
		 */
		findFreeGridSlots: function(width, height) {
			var cols = this.getGridColumns(),
				occupiedSlots = this.occupiedSlots;

			for(var start = 0; ; start++) {
				var row0 = Math.floor(start / cols),
					col0 = start % cols;

				if(col0 + width > cols) {
					continue;
				}

				var candidateSlots = [],
					fits = true;

				for(var r = 0; r < height && fits; r++) {
					for(var c = 0; c < width && fits; c++) {
						var index = (row0 + r) * cols + (col0 + c);

						if(occupiedSlots[index]) {
							fits = false;
							break;
						}

						candidateSlots.push(index);
					}
				}

				if(fits) {
					return candidateSlots;
				}
			}
		},
		/**
		 * placeNewWidget - claim a free spot in the placement grid for a
		 * freshly-placed widget, so it doesn't land on top of another
		 * widget still on the canvas. Reserves a 2x2 block instead of 1x1
		 * for Button/Knob/Video/Image, which also have a second, floating
		 * "detached" display (the actual big button/dial/player/image,
		 * dragged independently of the small widget box) that can be far
		 * larger than the widget box itself.
		 *
		 * Slots are tracked per-widget (this.widgetSlots) so
		 * removeWidget() can free exactly this widget's slots again when
		 * it's individually deleted - the next widget placed can then
		 * reuse that same spot, rather than the grid only ever growing.
		 *
		 * @param {object} view the widget view, already rendered and in
		 *   the DOM, with its wid already assigned
		 * @return {void}
		 */
		placeNewWidget: function(view) {
			var hasDetachedDisplay = this.WIDGETS_WITH_DETACHED_DISPLAY.indexOf(view.typeID) !== -1,
				reservesExtraGridSpace = this.WIDGETS_RESERVING_EXTRA_GRID_SPACE.indexOf(view.typeID) !== -1,
				cells = reservesExtraGridSpace ? 2 : 1,
				slots = this.findFreeGridSlots(cells, cells),
				cols = this.getGridColumns(),
				topLeftRow = Math.floor(slots[0] / cols),
				topLeftCol = slots[0] % cols,
				position = {
					left: this.GRID_START_LEFT + topLeftCol * this.GRID_STEP_X,
					top: this.GRID_START_TOP + topLeftRow * this.GRID_STEP_Y,
				};

			_.each(slots, function(slot) { this.occupiedSlots[slot] = true; }, this);
			this.widgetSlots[view.model.get('wid')] = slots;

			view.$el.css({left: position.left, top: position.top});
			// width: 148 matches the same hardcoded value WidgetMulti sets
			// on drag (both the whole-widget drag handler and the outlet/
			// inlet drag-stop handlers) - without it here too, a widget's
			// model has no 'width' at all until the user drags it at least
			// once, and connecting a cable from/to it before that makes
			// WidgetMulti's onDrop compute `model.get('width') - 8` as
			// NaN, which CableManager then can't turn into a valid SVG
			// path ("Expected number" for the cable's `d` attribute).
			view.model.set({offsetLeft: position.left, offsetTop: position.top, width: 148});

			if(hasDetachedDisplay) {
				// Keep this widget type's traditional offset between its
				// own box and its detached display (originally (120,50)
				// vs (100,200) - 20px left, ~150px down), just relative to
				// wherever this widget actually landed instead of a fixed
				// spot.
				var topOffset = this.DETACHED_DISPLAY_TOP_OFFSET[view.typeID] || 150;
				view.model.set({left: position.left - 20, top: position.top + topOffset});
			}
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

			// Free this widget's placement-grid slots (see
			// placeNewWidget()) so the next widget placed can reuse this
			// exact spot instead of the grid only ever growing.
			var widgetKey = widgetView.model.get('wid'),
				vacatedSlots = this.widgetSlots[widgetKey];

			if(vacatedSlots) {
				_.each(vacatedSlots, function(slot) { delete this.occupiedSlots[slot]; }, this);
				delete this.widgetSlots[widgetKey];
			}

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
				// Unmap any previous mappings
				this.removeMappingFromHardwareWidget(viewWID, modelType, server);
				var sourceModel = this.getHardwareModelInstance(modelType, server);
				var mappingObject = {
					model: sourceModel,
					map: IOMapping,
				};
				//var modelWID = view.model.get('wid');
				this.widgetMappings.push({
					viewWID: viewWID,
					map: mappingObject.map,
					modelWID: modelType + ":" + server,
					offsets: inletOffsets,
				});

				// Check if deviceMode is set. This indicates an output widget which needs its active field to be true (input)
				// and separates its output "active" field
				if((view.deviceMode === undefined || view.deviceMode === "in") && view.model.get("active") === true) {
					sourceModel.active = true;
					view.enableDevice.bind(view)();
				}
				else if(view.deviceMode !== undefined && view.model.get("activeOut") === true) {
					sourceModel.active = true;
					view.enableDevice.bind(view)();
				}

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

			if(widgetMap) {
				this.removeMapping(widgetMap);
			}
		},
		removeMappingFromHardwareWidget: function removeMappingFromWidget(wid, deviceType, server) {

			// Find any widgetmapping with this particular id
			var widgetMap = _.find(this.widgetMappings, function(widgetMapping) {
				return widgetMapping.viewWID == wid
				&& (widgetMapping.modelWID.match(":") != null);
			});

			// If you found one, remove it and unbind.
			if(widgetMap) {
				var hardwareDevice = this.getHardwareModelInstance(deviceType, server);
				if(hardwareDevice !== undefined) {
					// TODO: Could the unbinding be the main issue?
					//hardwareDevice.off('change'); // TODO: Make this remove the SPECIFIC listeners instead of all
				}

				// Remove the mapping explicitly here from widgetMappings... it also tries to do it with an event but that has logic for other things.. this ensures that we remove it from the widgetMappings
				this.removeMapping(widgetMap);
				window.app.vent.trigger('Widget:removeMapping', widgetMap, widgetMap.modelWID );
			}
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
				var lastChangedAttributes = undefined;

					newModelInstance.on('change', function updateHardwareModel(model) {
						var changedAttributes = model.changedAttributes();

						// Check all the changed attributes
						for(attribute in changedAttributes) {

							var lastAttribute = undefined;
							// TODO: This triggers many times even though there is only attribute?
							for(pinName in attribute) {
								// TODO: Doing this to ensure only one call is made if it is, for some reason, treating it as if more pins are attribute than there actually is (see previous TODO)
								if( attribute != lastAttribute ) {

									lastAttribute = attribute;
									if(pinName[0] != "A") {
										// and see if the attribute exists in the outputs section of this model
										if(newModelInstance.attributes.outputs[attribute] !== undefined) {
											// TODO: THIS modeRequested SHOULD BE SPECIFIC TO VIEW
											//window.app.vent.trigger('sendDeviceModelUpdate', {modelType: modelServerQuery, model: changedAttributes, modeRequested: 3});
											window.app.vent.trigger('sendDeviceModelUpdate', {modelType: modelServerQuery, model: changedAttributes});
										}
									}

								}
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
    exportPatch: function() {
      var patch = {
        widgets: this.widgetModels.toJSON(),
        mappings: this.widgetMappings,
      };

			// Built and downloaded entirely client-side (Blob + a throwaway
			// <a download>), NOT round-tripped through the server's
			// GET /patch.ntk?patch=<entire JSON as a URL-encoded query
			// string> the way this used to work - a widget with any real
			// amount of data (e.g. PoseTrack's recorded training examples)
			// can push the encoded patch past the request-line length
			// limit most HTTP servers enforce (Node's own default is well
			// under 100KB), which fails the request outright. Worse, the
			// old code drove that GET via window.location.href - a full-
			// page navigation - so a failed request didn't just fail to
			// download, it tore down the entire running SPA (blank/white
			// canvas, "net::ERR_CONNECTION_RESET"). A Blob URL has no such
			// size ceiling and never leaves the page.
			var blob = new Blob([JSON.stringify(patch)], {type: 'application/octet-stream'});
			var blobURL = URL.createObjectURL(blob);
			var link = document.createElement('a');
			link.href = blobURL;
			link.download = 'patch.ntk';
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(blobURL);
    },
		clearPatch: function() {
			var emptyPatch = {"widgets":[],"mappings":[]};

			window.app.vent.trigger('clearPatch', {patch: emptyPatch });
			//this.loadPatch(JSON.stringify(emptyPatch), false);
		},
	};

	return PatcherController;
});
