define([
	'backbone',
	'rivets',
	'models/WidgetConfig',
	'text!tmpl/item/Widget_tmpl.js',
	'jqueryui',
	'jquerytouchpunch',
],
function( Backbone, rivets, WidgetConfigModel, WidgetTmpl, jqueryui, jquerytouchpunch  ) {
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
		},
		widgetEvents: {},

		className: 'widget',
		template: _.template( WidgetTmpl ),

		initialize: function(options) {
			_.extend(this.events, this.widgetEvents);
			options = options ? options : {};
			_.extend(options, {ins: this.ins});
			_.extend(options, {outs: this.outs});
			this.signalChainFunctions = [];
			this.sources = [];

			this.model = new WidgetConfigModel(options);
			this.model.on('change', this.processSignalChain, this);
			// DEBUG
			window.FF = this;

			this.setWidgetBinders();
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

			// Make Widget draggable
			this.$el.draggable({
				handle: '.dragHandle',
				drag: function(e, object) {
					// update our own stored position (for saving the state of this widget and also for triggering change event to inform any listening widgets attached to this widget)
					// TODO: + 40 is added to the height to account for padding. Calculate that instead
					self.model.set({'offsetLeft': object.offset.left, 'offsetTop': object.offset.top, height: self.$el.height() + 40});

					// update any patch cables that are attached to the inlets on this model with our new coordinates
					if(self.cable) {
						app.cableManager.updateCoordinates(self.cable, {
							to: {x: self.model.get('offsetLeft'), y: self.model.get('offsetTop')},
						});
					}
				}
			});
			// Set the data model on all outlets and make draggable
			this.$('.outlet').draggable({
				revert: true,
			}).data('model', this.model);
			// Make all inlets droppable and bind the onDrop handler when one drops onto it
			this.$('.inlet').droppable({
				hoverClass: 'hover',
				drop: function(e, ui) {
					var droppedModel = $(ui.draggable).data('model');
					self.onDrop(e, ui, droppedModel);

					// Create a new patch cable between the source widget and this widget's inlet
					self.cable = app.cableManager.createConnection({
						from: {x: droppedModel.get('offsetLeft'), y: droppedModel.get('offsetTop') + droppedModel.get('height')},
						to: {x: self.model.get('offsetLeft'), y: self.model.get('offsetTop')},
					});
				},
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
			var sourceField = ui.draggable[0].dataset.field,
				destinationField = e.target.dataset.field;

			app.Patcher.Controller.mapToModel({
				view: this,
				model: model,
				// use ui data-field to map
				IOMapping: {sourceField: sourceField, destinationField: destinationField},
			});

			$(e.target).addClass('connected');
		},
		unMapInlet: function() {

			this.stopListening(this.sourceModel);
			this.sourceModel = undefined;
			this.$('.inlet').removeClass('connected');
		},
        /**
         * remove the widget from both the DOM and the controller
         *
         * @return {void}
         */
		removeWidget: function() {
			app.Patcher.Controller.removeWidget(this);
			this.remove();
		},
		destinationModels: [],
		onSync: function() {},
        /**
         * Takes the attributes from the sourceModel and maps them onto the selected attributes of the Widget's model
         *
         * @param model
         * @return
         */
		syncWithSourceModel: function(model) {
			// check if the widget is "turned on"
			if(this.model.get('active')) {
				// Check if there is a mapping for the attribute given and map it if so
				for(var property in model.attributes) {

					for(var widgetProperty in this.model.attributes) {

						if(this.model.attributes[widgetProperty] === property) {
							if(widgetProperty === 'inputMapping') {
								// Ins always defer to the sourceModel
								if(model.changedAttributes()[property]) {
									this.model.set('in', model.get(property));
								}
							}
						}
					}
				}
			}

			this.onSync();
		},
		syncWithDestinationModel: function(model) {
			// check if the widget is "turned on"
			if(this.model.get('active')) {
				// Check if there is a mapping for the attribute given and map it if so
				for(var property in this.destinationModel.attributes) {

					for(var widgetProperty in model.attributes) {

						if(this.model.attributes[widgetProperty] === property) {
							if(widgetProperty === 'outputMapping') {
								if(model.changedAttributes()['out']) {
									this.destinationModel.set(model.get('outputMapping'), this.model.attributes.out);
								}
							}
						}
					}
				}
			}

			this.onSync();
		},
		addInputMap: function(map) {
			this.sources.push(map);

			this.listenTo(map.model, 'change', this.syncWithSource);
		},
		syncWithSource: function(model) {
			var sourceMappings = _.map(_.where(this.sources, {model: model}), function(source) {
				return source.map;
			});

			// Map any incoming data to this model's data
			for(var i=sourceMappings.length-1; i>=0; i--) {
				var mapping = sourceMappings[i];
				if(this.model.get('active') && this.model.attributes[mapping.destinationField] !== undefined) {
					this.model.set(mapping.destinationField, model.get(mapping.sourceField));
				}
				else if(this.model.get('active') && model.attributes[mapping.destinationField] !== undefined) {
					model.set(mapping.destinationField, this.model.get(mapping.sourceField));
				}
			}

			if(model.changedAttributes().offsetLeft || model.changedAttributes().offsetTop ) {
				if(this.cable) {
						app.cableManager.updateCoordinates(this.cable, {
							from: {x: model.get('offsetLeft'), y: model.get('offsetTop') + model.get('height')},
						});
				}
			}
		},
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

	});

});
