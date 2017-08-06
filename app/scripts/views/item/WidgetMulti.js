define([
	'backbone',
	'rivets',
	'models/WidgetConfig',
	'text!tmpl/item/Widget_tmpl.js',
	'jqueryui',
	'jquerytouchpunch',
],
function( Backbone, rivets, WidgetConfigModel, WidgetTmpl, jqueryui, jquerytouchpunch ) {
    'use strict';

    /**
     * Widget view base class
     *
     * @return {Backbone.Marionette.ItemView}
     */
	return Backbone.Marionette.ItemView.extend({
		events: {
			'click .inlet .unMap': 'unMapInlet',
			'click .remove': 'removeWidget',
			'blur .settings input': 'onChangeSettings',
		},
		widgetEvents: {},

		className: 'widget',
		categories: [],
		template: function(serializedModel) {
			return _.template( WidgetTmpl, {server: app.server} );
		},

		initialize: function(options) {
			// We pass the model to the widget which ends up in options. If we extend options here, we'd end up with a recursive reference so nulling it out for now.
			options.model = undefined;
			_.extend(this.events, this.widgetEvents);
			options = options ? options : {};
			_.extend(options, {ins: this.ins});
			_.extend(options, {outs: this.outs});
			_.extend(options, {typeID: this.typeID});
			this.signalChainFunctions = [];
			this.sources = [];
			this.cables = [];

			//this.model = new WidgetConfigModel(options);
			this.model.set(options);
			this.model.set('server', app.server);

			this.model.on('change', this.processSignalChain, this);
			this.model.on('change', this.onModelChange, this);
			this.model.on('change', this.checkOutputMappingUpdate, this);

			window.app.vent.on('Widget:removeMapping', this.removeMapping, this);

			this.setWidgetBinders();
			this.setTopZIndex();
		},
		onRender: function() {
			var self = this;
			if(!this.el.className.match(/ widget/)) {
				this.el.className += " widget";
			}

			// Bind/rebind rivets to the models
			rivets.bind(this.$el, {widget: this.model, sources: this.sources});

			if(this.sourceModel) {
				this.listenTo(this.sourceModel, 'change', this.syncWithSourceModel);
			}

			this.makeDraggable();

            this.$( ".widgetBottom .content" ).hide();
            this.$( ".widgetBottom .tab" ).click(function() {
                self.$( ".widgetBottom .content" ).toggle();
            });

			// Displays the cid on the widget for debugging purposes
			//self.$('.remove').append(' ' + this.model.attributes.wid);

		},
		onModelChange: function(model) {
		},
		/**
		 * Check if a hardware mapping has changed
		 *
		 * @param model
		 * @return {undefined}
		 */
		checkOutputMappingUpdate: function checkOutputMappingUpdate(model) {

			var outputMapping = model.changedAttributes().outputMapping,
				hasInput = this.deviceMode == 'in';

			if(outputMapping) {
				// If a change has occurred make sure to send the change along to the server so we can switch pin modes if needed
				// Do this for all sources and include the address of the source
				for(var i=this.sources.length-1; i>=0; i--) {
					var deviceType = this.sources[i].model.get('type');
					if(deviceType !== undefined) {
						window.app.vent.trigger('Widget:hardwareSwitch', {
							deviceType: deviceType + ":" + this.getDeviceServerName() + ":" + this.getDeviceServerPort(),
							port: outputMapping,
							mode: this.deviceMode,
							hasInput: hasInput
						});
					}
				}
			}

			var inputMapping = model.changedAttributes().inputMapping;
			if(inputMapping) {
				// If a change has occurred make sure to send the change along to the server so we can switch pin modes if needed
				// Do this for all sources and include the address of the source
				for(var i=this.sources.length-1; i>=0; i--) {
					window.app.vent.trigger('Widget:hardwareSwitch', {deviceType: this.sources[i].model.get('type') + ":" + this.getDeviceServerName() + ":" + this.getDeviceServerPort(), port: inputMapping, mode: this.deviceMode} );
				}
			}
		},
		getDeviceModelType: function() {return this.model.get('deviceType') === undefined ? 'ArduinoUno' : this.model.get('deviceType')},
		getDeviceServerName: function() {return this.model.get('server') == undefined ? '127.0.0.1' : this.model.get('server')},
		getDeviceServerPort: function() {return this.model.get('port') == undefined ? 9001 : this.model.get('port')},
		makeDraggable: function() {

			var updateCables = function updateCables(e, object) {
				// update our own stored position (for saving the state of this widget and also for triggering change event to inform any listening widgets attached to this widget)
				if(object !== undefined) {
					//this.model.set({'offsetLeft': object.position.left, 'offsetTop': object.position.top, height: this.$el.height(), width: this.$el.width()});
					this.model.set({'offsetLeft': object.position.left, 'offsetTop': object.position.top, height: this.$el.height(), width: 148});
				}
				else {
					// If we don't have an object (no object is passed when we are referencing the widget that was dragged), then use this widget's position as a reference
					//this.model.set({'offsetLeft': this.$el.position().left, 'offsetTop': this.$el.position().top, height: this.$el.height(), width: this.$el.width()});
					this.model.set({'offsetLeft': this.$el.position().left, 'offsetTop': this.$el.position().top, height: this.$el.height(), width: 148});
					
				}

				// update any patch cables that are attached to the inlets on this model with our new coordinates
				if(this.cables.length) {
					for(var i=this.cables.length-1; i>=0; i--) {
						if(this.cables[i].offsets) {
							this.cables[i].cable.updateCoordinates( {
								to: {x: this.model.get('offsetLeft') + this.cables[i].offsets.destination.x, y: this.model.get('offsetTop') + this.cables[i].offsets.destination.y},
							});
						}
						else {
							this.cables[i].cable.updateCoordinates( {
								to: {x: this.model.get('offsetLeft'), y: this.model.get('offsetTop')},
							});

						}
					}
				}
			};

			// Make Widget draggable
			this.$el.draggable({
				handle: '.dragHandle',
				drag: (updateCables).bind(this),
				stack: ".widget",
			});

			this.$el.css({position: 'absolute'});
			// Set the data model on all outlets and make draggable
			this.$('.outlet').draggable({
				revert: true,
				stop: (function(e, ui) {
					updateCables.bind(this)(e);
				}).bind(this),
			}).data('model', this.model);

			// Make all inlets droppable and bind the onDrop handler when one drops onto it
			this.$('.inlet').draggable({
				revert: true,
				revertDuration: 0,
				stop: (function(e, ui) {
					this.unMapInlet(e, ui, this);
				}).bind(this),
			});

			this.$('.inlet').droppable({
				hoverClass: 'hover',
				drop: (function(e, ui) {
					var droppedModel = $(ui.draggable).data('model');
					this.onDrop(e, ui, droppedModel);
				}).bind(this),
			});

		},
		/**
		 * attach custom rivets binders for Widget views
		 *
		 * @return
		 */
		setWidgetBinders: function() {
			var self = this;
			// TODO: Pull out so this is not redefined everytime you create a widget
			rivets.binders.positionx = function(el, value) {
				el.style.left = parseInt( value, 10 ) + "px";
			};
			rivets.binders.positiony = function(el, value) {
				el.style.top = parseInt( value, 10 ) + "px";
			};

			rivets.binders['style-*'] = function(el, value) {
				el.style.setProperty(this.args[0], value/100);
			};
			rivets.binders['style-activecontrol'] = function(el, value) {
				var activeControl = this.model.get('activeControlParameter'),
					constructedValue = value;

				switch(activeControl) {
					case 'top':
					case 'left':
					case 'bottom':
					case 'right':
						constructedValue += 'px';
						break;
					case 'opacity':
						constructedValue /= 100;
					default:
						break;
				}

				el.style[activeControl] = constructedValue;
			};
			rivets.binders.selected = {
				bind: function(el) {
					var callback = function(e) {
						self.model.set(this.keypath.split(':')[1], $(e.currentTarget).find('option:selected').val());
					};

					$(el).on('change', _.bind(callback,this));
				},

				unbind: function(el) {
					$(el).off('change', this.callback);
				},

				routine: function(el, value) {
					self.$('select').val(value);
				}
			}
            // rivets formatters
            rivets.formatters.rounded = function (value){
                if (isNaN(value)) return '--';
                else return Number(value).toFixed(0);
            }
            rivets.formatters.twodecimals = function (value){
                var output = Number(value);
                if (isNaN(value)) return '--';
                else if (output >= 100) {
                    return output.toFixed(0);
                } else if (output >= 10 && output < 100) {
                    return output.toFixed(1);
                } else {
                    return output.toFixed(2);
                }
            }
		},
		/**
		 * Sets the ZIndex to place the widget at the top of the widget stack
		 *
		 * @return {undefined}
		 */
		setTopZIndex: function setTopZIndex() {
			var topZIndex = 0;

			$('.widget').each(function() {
				var index = parseInt($(this).css('z-index'), 10);
				if(index > topZIndex) {
					topZIndex = index;
				}
			});

			this.$el.css('z-index', topZIndex);
		},
		/**
		 * Called when you drop onto an inlet. Maps the dropped model w/ parameter to the inlet
		 *
		 * @param {Event} e
		 * @param {element} ui
		 * @param {Backbone.Model} model
		 * @return {void}
		 */
		onDrop: function(e, ui, model) {

			// REMOVE ANY CURRENTLY MAPPED INLETS
			this.unMapInlet(e, ui);

			var sourceField = ui.draggable[0].dataset.field,
				destinationField = e.target.dataset.field;

			// If the offsets have not been set from dragging, set them manually
			if(!this.model.get('offsetLeft') && !this.model.get('offsetTop')) {
				//this.model.set({'offsetLeft': this.$el.position().left, 'offsetTop': this.$el.position().top, height: this.$el.height(), width: this.$el.width()});
				this.model.set({'offsetLeft': this.$el.position().left, 'offsetTop': this.$el.position().top, height: this.$el.height(), width: 148});
			}

			if(!model.get('offsetLeft') && !model.get('offsetTop')) {
				//model.set({'offsetLeft': $(ui.draggable[0].parentNode.parentNode).position().left, 'offsetTop': $(ui.draggable[0].parentNode.parentNode).position().top, height: this.$el.height(), width: this.$el.width()});
				model.set({'offsetLeft': $(ui.draggable[0].parentNode.parentNode).position().left, 'offsetTop': $(ui.draggable[0].parentNode.parentNode).position().top, height: this.$el.height(), width: 148});
			}

			// Map the dropped model to this inlet
			app.Patcher.Controller.mapToModel({
				view: this,
				model: model,
				// use ui data-field to map
				IOMapping: {sourceField: sourceField, destinationField: destinationField},
				// the numbers here are to center the cables and visually nudge on the outlet/inlet for visual alignment
				inletOffsets: {source: {x: model.get('width') - 8, y: ui.draggable.css({top: 0, left: 0}).position().top + 12}, destination: {x: 5, y: $(e.target).position().top + 12}},
			});

			$(e.target).addClass('connected');
		},
		/**
		 * Remove mapping objects and stop listening to the field. Also remove the cable associated with the inlet
		 *
		 * @param {Event} e
		 * @param {DOM element} ui
		 * @param {DOM element} draggable
		 * @return {void}
		 */
		unMapInlet: function(e, ui, draggable) {
			var inletField = e.target.dataset.field;

			// Remove all mappings that match this inlet's field
			this.sourceToRemove = _.find(this.sources, function(item){ return item.map.destinationField === inletField; });
			this.sources = _.reject(this.sources, function(item){ return item.map.destinationField === inletField; });

			if(this.sourceToRemove) {
				// Remove the cable and the reference to the cable from the cables array
				var cableToRemove = _.find(this.cables, function(item) { return item.map.destinationField === inletField});

				window.app.vent.trigger('Widget:removeMapping', this.sourceToRemove, this.model.get('wid') );

				cableToRemove !== undefined && cableToRemove.cable.remove();
				this.cables = _.reject(this.cables, function(item) { return item.map.destinationField === inletField});
			}

		},
		removeMapping: function removeMapping(source, modelWID) {
			if(source.viewWID == this.model.get('wid') ) {
				var modelType = modelWID.split(":")[0];

				if(modelType !== 'ArduinoUno') {
					this.sources = _.reject(this.sources, function(source) {
						return source.model.attributes.wid == modelWID;
					});
				}
				else {
					// IF the model is a hardware model
					this.sources = _.reject(this.sources, function(source) {
						//TODO: This seems sketchy. Doesn't allow for more than one type of device
						return source.model.attributes.type == modelType;
					});
				}
			}
		},
		/**
		 * add a patch cable to this widget so we can update and track it
		 *
		 * @param {Cable} cable
		 * @param {Backbone.Model} fromModel the model that the cable is attached to on the other side
		 * @return {WidgetView} this view
		 */
		addCable: function(cable, fromModel, inletOffsets, mapping, sourceViewID) {
			this.cables.push({ map: mapping, model: fromModel, cable: cable, offsets: inletOffsets, sourceViewID: sourceViewID });
		},
		/**
		 * remove the widget from both the DOM and the controller
		 *
		 * @return {void}
		 */
		removeWidget: function(e, calledFromLoader) {

			app.Patcher.Controller.removeWidget(this, calledFromLoader);

			var IDsToRemove = [];
			for(var i=this.cables.length-1; i>=0; i--) {
				this.cables[i].cable.remove();
				IDsToRemove.push(i);
			}

			for(var i=IDsToRemove.length-1; i>=0; i--) {
				var indexOfID = IDsToRemove.indexOf(
					_.findWhere(this.cables, function(cable) {
						return cable.id = IDsToRemove[i];
					})
				);

				this.cables.splice(indexOfID, 1);
				window.app.cableManager.removeConnection(IDsToRemove[i]);
			}

			this.remove();
			if(this.onRemove) {
				this.onRemove();
			}
		},
		removeCable: function(cable) {

			// Find and remove the cable from the array
			this.cables = _.without(this.cables, _.find(
				this.cables, function(cableMap) {
					return cableMap.cable == cable;
				})
			);

			// Call the remove method on the cable itself
			cable.remove();
			window.app.cableManager.removeConnection(cable.id);
		},
		destinationModels: [],
		onSync: function() {},
		onChangeSettings: function() {

			var inputVal = this.$('.settings input').val();

			if(inputVal !== undefined && inputVal.length !== 0) {

				var allMappingsOtherThanThis = _.reject(window.app.Patcher.Controller.widgetMappings, function(map) {
					return map.viewWID == this.model.get('wid');
				}, this);

				var existingMappings = _.filter(allMappingsOtherThanThis, function(map) {
					return map.map.destinationField === inputVal;
				});

				if(existingMappings.length > 0) {
					this.sources[0].map.destinationField = "";
					this.model.set('outputMapping', "");
					alert('This port cannot be used as it is already in use by another widget.');

					return false;
				}
			}

			if(this.$('.settings input').parents('.rightTab').length > 0 ) {
				this.model.set('outputMapping', inputVal);
			}
			else {
				this.model.set('inputMapping', inputVal);
			}

			//var mappings = this.sources.slice(this.sources.length-1);
			var mappings;
			mappings = JSON.parse(JSON.stringify(this.sources));

			for(var i=mappings.length-1; i >= 0; i--) {
				mappings[i].model = undefined;
			}

			window.app.vent.trigger('Widget:updateSourceMappings', this.model.get('wid'), mappings);
		},
		/**
		 * Takes the attributes from the sourceModel and maps them onto the selected attributes of the Widget's model
		 *
		 * @param model
		 * @return
		 */
		addInputMap: function(map) {

			// Check if we already have this mapping in sources
			var duplicate = false;
			for(var i=this.sources.length-1; i>=0; i--) {
				if(
					this.sources[i].map.destinationField === map.map.destinationField 
				   && this.sources[i].map.sourceField === map.map.sourceField
				   && this.sources[i].model.cid === map.model.cid
				   && this.sources[i].model.get('wid') === map.model.get('wid') ) {
					   duplicate = true;
				   }
			}

			if(!duplicate) {
				// If there is already a mapping to this destination field, update it
				var update = false;
				for(var i=this.sources.length-1; i>=0; i--) {
					if(this.sources[i].map.destinationField === map.map.destinationField) {
						this.sources[i].map.sourceField = map.map.sourceField;
						update = true;
					}
				}


				// This is good to prevent memory leaks but the update logic needs to be better
				//if(!update) {
					this.sources.push(map);
				//}

				this.listenTo(map.model, 'change', this.syncWithSource);
			}
		},
		syncWithSource: function(externalModel, options) {
			var thisWidgetModel = this.model;

			var sourceMappings = _.map(_.where(this.sources, {model: externalModel}), function(source) {
				return source.map;
			});

			// Map any incoming data to this model's data
			for(var i=sourceMappings.length-1; i>=0; i--) {
				var mapping = sourceMappings[i];
				if(thisWidgetModel.get('active') && thisWidgetModel.attributes[mapping.destinationField] !== undefined) {
					var attributes = {},
						value = externalModel.get(mapping.sourceField);
					attributes[mapping.destinationField] = value == undefined ? 0 : value;
                    // update the input of the widget
					//console.log('update input', this.typeID, new Error().stack);
					var trigger = true;
					if(this.deviceMode == 'in') {
						trigger = false;
					}

					thisWidgetModel.set(attributes, {updateNoTrigger: true, trigger: trigger});
				}
				//else if(thisWidgetModel.get('active') && thisWidgetModel.get('activeOut') && externalModel.attributes[mapping.destinationField] !== undefined) {
				else if(thisWidgetModel.get('active') && thisWidgetModel.get('activeOut')) {
                    // update the output of the widget where hardware such as Arduino is involved
					if(externalModel.attributes[thisWidgetModel.get('outputMapping')] !== thisWidgetModel.get(mapping.sourceField)) {
						var attributes = {};

						attributes[thisWidgetModel.get('outputMapping')] = thisWidgetModel.get(mapping.sourceField);

						var trigger = true;
						if(this.deviceMode == 'in') {
							trigger = false;
						}

						// SET!
						console.log("setting", attributes, trigger);
						externalModel.set(attributes, {fromServer: false, trigger: trigger});
					}

				}
			}

			if(externalModel.changedAttributes().offsetLeft || externalModel.changedAttributes().offsetTop ) {
				if(this.cables.length) {
					for(var i=this.cables.length-1; i>=0; i--) {
						var cableObj = this.cables[i];
						if(cableObj.model === externalModel) {
							cableObj.cable.updateCoordinates( {
								from: {x: externalModel.get('offsetLeft') + cableObj.offsets.source.x, y: externalModel.get('offsetTop') + cableObj.offsets.source.y},
							});
						}
					}
				}
			}
		},
		/**
		 * Process any inputs through custom filters
		 *
		 * @return {undefined}
		 */
		processSignalChain: function() {
			var outputs = this.model.get('outs'),
				outputsObj = {};

			if(outputs) {
				for(var i=outputs.length-1; i>=0; i--) {
					var output = outputs[i];
					outputsObj[output.to] = this.model.get(output.from);

					var outputField = outputsObj[output.to];
					// Process the input through all signal functions attached to this view's signalChainFunctions array
					_.each(this.signalChainFunctions, function(func) {
						func = _.bind(func, this);
						outputField = func(outputField, this.model.attributes);
					}, this);

					outputsObj[output.to] = outputField;
				}

				for(var processedOutput in outputsObj) {
					var outputField = outputsObj[processedOutput];

					this.model.set(processedOutput, outputsObj[processedOutput]);

				}
			}
		},


		/**
		 * Set the attributes of a model based on a passed model
		 * (usually from something like a patch loader or something)
		 *
		 * @param {object} model
		 * @return {WidgetMulti} this view
		 */
		setFromModel: function(model) {
			this.$el.css({top: model.offsetTop, left: model.offsetLeft});
			this.model.set(model);

			return this;
		},
		setAsHardwareOutput: function setAsHardwareOutput() {
			this.onModelChange = function(model) {
				console.log('GO!');
				for(var i=this.sources.length-1; i>=0; i--) {
					this.syncWithSource(this.sources[i].model);
				}
			};
		},
	});

});
