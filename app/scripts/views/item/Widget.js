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
			this.signalChainFunctions = [];

			this.model = new WidgetConfigModel(options);
			this.model.on('change', this.processSignalChain, this);

			this.setWidgetBinders();
		},
		onRender: function() {
			var self = this;

			if(!this.el.className.match(/ widget/)) {
				this.el.className += " widget";
			}

			rivets.bind(this.$el, {widget: this.model, input: this.sourceModel, output: this.destinationModel});

			if(this.sourceModel) {
				this.listenTo(this.sourceModel, 'change', this.syncWithSourceModel);
			}
			if(this.destinationModel) {
				this.listenTo(this.model, 'change', this.syncWithDestinationModel);
			}

			this.$el.draggable({handle: '.dragHandle'});
			this.$('.outlet').draggable({
				revert: true,
			}).data('model', this.model);
			this.$('.inlet').droppable({
				hoverClass: 'hover',
				drop: function(e, ui) {
					self.onDrop($(ui.draggable).data('model'), ui, e);
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
		onDrop: function(model, ui, e) {
			console.log(model, ui, e);
			app.Patcher.Controller.mapToModel({
				view: this,
				model: model,
				IOMapping: 'in',
			});

			this.$('.inlet').addClass('connected');
		},
		unMapInlet: function() {

			this.stopListening(this.sourceModel);
			this.sourceModel = undefined;
			this.$('.inlet').removeClass('connected');
		},
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
		processSignalChain: function() {
			var input = this.model.get('in');

			// Process the input through all signal functions attached to this view's signalChainFunctions array
			_.each(this.signalChainFunctions, function(func) {
				func = _.bind(func, this);
				input = func(input);
			}, this);

			this.model.set('out', input);
		},

	});

});
