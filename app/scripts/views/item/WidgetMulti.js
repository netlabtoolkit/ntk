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
		},
		widgetEvents: {},

		className: 'widget',
		template: _.template( WidgetTmpl ),

		initialize: function(options) {
			_.extend(this.events, this.widgetEvents);
			console.log(this.ins);
			_.extend(options, {ins: this.ins});
			_.extend(options, {outs: this.outs});
			this.signalChainFunctions = [];

			this.model = new WidgetConfigModel(options);
			this.model.on('change', this.processSignalChain, this);
			window.FF = this.model;

			this.setWidgetBinders();
		},
		onRender: function() {
			var self = this;

			if(!this.el.className.match(/ widget/)) {
				this.el.className += " widget";
			}

			//rivets.bind(this.$el, {widget: this.model, input: this.sourceModel, output: this.destinationModel});
			rivets.bind(this.$el, {widget: this.model});

			//if(this.sourceModel) {
				//this.listenTo(this.sourceModel, 'change', this.syncWithSourceModel);
			//}
			//if(this.destinationModel) {
				//this.listenTo(this.model, 'change', this.syncWithDestinationModel);
			//}

			this.$el.draggable({handle: '.dragHandle'});
			this.$('.outlet').draggable({
				revert: true,
			}).data('model', this.model);
			this.$('.inlet').droppable({
				hoverClass: 'hover',
				drop: function(e, ui) {
					self.onDrop(e, ui, $(ui.draggable).data('model'));
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
		onDrop: function(e, ui, model) {
			var sourceField = ui.draggable[0].dataset.field,
				destinationField = e.target.dataset.field;

			app.Patcher.Controller.mapToModel({
				view: this,
				model: model,
				// use ui data-field to map
				IOMapping: {sourceField: sourceField, destinationField: destinationField},
			});

			console.log(e.target.className);
			//e.target.className += ' connected';
			$(e.target).addClass('connected');
		},
		unMapInlet: function() {

			this.stopListening(this.sourceModel);
			this.sourceModel = undefined;
			this.$('.inlet').removeClass('connected');
		},
		sources: [],
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

			for(var i=sourceMappings.length-1; i>=0; i--) {
				var mapping = sourceMappings[i];
				this.model.set(mapping.destinationField, model.get(mapping.sourceField));
			}
		},
		processSignalChain: function() {

			var inputs = this.model.get('ins'),
                inputsObj = {};

				if(inputs) {

					for(var i=inputs.length-1; i>=0; i--) {
						var input = inputs[i];
						inputsObj[input.name] = this.model.get(input.fieldMap);
					}

					// Process the input through all signal functions attached to this view's signalChainFunctions array
					_.each(this.signalChainFunctions, function(func) {
						func = _.bind(func, this);
						inputsObj = func(inputsObj);
					}, this);

					for(var processedInput in inputsObj) {
						var outlet = _.findWhere(this.model.get('outs'), {name: processedInput});
						console.log(inputsObj, processedInput, outlet);

						if(outlet) {
							this.model.set(outlet.fieldMap, inputsObj[processedInput] );
						}
					}
				}
		},

	});

});
