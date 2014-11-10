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
			this.model.on('change', this.processSignalChain, this);
			this.model.on('change', this.onModelChange, this);

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

			this.makeDraggable();

            this.$( ".widgetBottom .content" ).hide();
            this.$( ".widgetBottom .tab" ).click(function() {
                self.$( ".widgetBottom .content" ).toggle();
            });

		},
		onModelChange: function(model) {
		},
		makeDraggable: function() {
			var self = this;
			// Make Widget draggable
			this.$el.draggable({
				handle: '.dragHandle',
				drag: function(e, object) {
					// update our own stored position (for saving the state of this widget and also for triggering change event to inform any listening widgets attached to this widget)
					self.model.set({'offsetLeft': object.position.left, 'offsetTop': object.position.top, height: self.$el.height(), width: self.$el.width()});

					// update any patch cables that are attached to the inlets on this model with our new coordinates
					if(self.cables.length) {
						for(var i=self.cables.length-1; i>=0; i--) {
							if(self.cables[i].offsets) {
								self.cables[i].cable.updateCoordinates( {
									to: {x: self.model.get('offsetLeft') + self.cables[i].offsets.destination.x, y: self.model.get('offsetTop') + self.cables[i].offsets.destination.y},
								});
							}
							else {
								self.cables[i].cable.updateCoordinates( {
									to: {x: self.model.get('offsetLeft'), y: self.model.get('offsetTop')},
								});

							}
						}
					}
				},
				stack: ".widget",
			});

			this.$el.css({position: 'absolute'});
			// Set the data model on all outlets and make draggable
			this.$('.outlet').draggable({
				revert: true,
			}).data('model', this.model);

			// Make all inlets droppable and bind the onDrop handler when one drops onto it
			this.$('.inlet').draggable({
				revert: true,
				revertDuration: 0,
				stop: function(e, ui) {
					self.unMapInlet(e, ui, this);
				}
			});

			this.$('.inlet').droppable({
				hoverClass: 'hover',
				drop: function(e, ui) {
					var droppedModel = $(ui.draggable).data('model');
					self.onDrop(e, ui, droppedModel);
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

			// If the offsets have not been set from dragging, set them manually
			if(!this.model.get('offsetLeft') && !this.model.get('offsetTop')) {
				this.model.set({'offsetLeft': this.$el.position().left, 'offsetTop': this.$el.position().top, height: this.$el.height(), width: this.$el.width()});
			}

			if(!model.get('offsetLeft') && !model.get('offsetTop')) {
				model.set({'offsetLeft': $(ui.draggable[0].parentNode.parentNode).position().left, 'offsetTop': $(ui.draggable[0].parentNode.parentNode).position().top, height: this.$el.height(), width: this.$el.width()});
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
			var inletField = draggable.dataset.field;

			// Remove all mappings that match this inlet's field
			this.sources = _.reject(this.sources, function(item){ return item.map.destinationField === inletField; });

			// Remove the cable and the reference to the cable from the cables array
			var cableToRemove = _.find(this.cables, function(item) { return item.map.destinationField === inletField});
			window.app.vent.trigger('Widget:removeMapping', cableToRemove.map );
			cableToRemove.cable.remove();
			this.cables = _.reject(this.cables, function(item) { return item.map.destinationField === inletField});

		},
        /**
         * add a patch cable to this widget so we can update and track it
         *
         * @param {Cable} cable
         * @param {Backbone.Model} fromModel the model that the cable is attached to on the other side
         * @return {WidgetView} this view
         */
		addCable: function(cable, fromModel, inletOffsets, mapping) {
			//this.cables.push({ model: fromModel, cable: cable, offsets: inletOffsets });
			this.cables.push({ map: mapping, model: fromModel, cable: cable, offsets: inletOffsets });
		},
        /**
         * remove the widget from both the DOM and the controller
         *
         * @return {void}
         */
		removeWidget: function() {
			app.Patcher.Controller.removeWidget(this);
			for(var i=this.cables.length-1; i>=0; i--) {
				this.cables[i].cable.remove();
			}

			this.remove();
			if(this.onRemove) {
				this.onRemove();
			}
		},
		destinationModels: [],
		onSync: function() {},
        /**
         * Takes the attributes from the sourceModel and maps them onto the selected attributes of the Widget's model
         *
         * @param model
         * @return
         */
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
                    // update the input of the widget
					this.model.set(mapping.destinationField, model.get(mapping.sourceField));
				}
				else if (this.model.get('active') && this.model.get('activeOut') && model.attributes[mapping.destinationField] !== undefined) {
                    // update the output of the widget where hardware such as Arduino is involved
					model.set(mapping.destinationField, this.model.get(mapping.sourceField));
				}
			}

			if(model.changedAttributes().offsetLeft || model.changedAttributes().offsetTop ) {
				if(this.cables.length) {
					for(var i=this.cables.length-1; i>=0; i--) {
						var cableObj = this.cables[i];
						if(cableObj.model === model) {
							cableObj.cable.updateCoordinates( {
								from: {x: model.get('offsetLeft') + cableObj.offsets.source.x, y: model.get('offsetTop') + cableObj.offsets.source.y},
							});
						}
					}
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
	});

});
