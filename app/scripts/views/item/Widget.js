define([
	'backbone',
	'rivets',
	'models/WidgetConfig',
	'text!tmpl/item/Widget_tmpl.js',
	'jqueryui',
],
function( Backbone, rivets, WidgetConfigModel, WidgetTmpl  ) {
    'use strict';

    /**
     * Widget view base class
     *
     * @return {Backbone.Marionette.ItemView}
     */
	return Backbone.Marionette.ItemView.extend({
		events: {},

		className: 'widget',
		template: _.template( WidgetTmpl ),

		initialize: function(options) {
			this.model = new WidgetConfigModel(options);
			this.setWidgetBinders();
		},
		onRender: function() {
			if(!this.el.className.match(/ widget/)) {
				this.el.className += " widget";
			}

			rivets.bind(this.$el, {widget: this.model});

			if(this.sourceModel) {
				this.listenTo(this.sourceModel, 'change', this.syncWithSourceModel);
			}

			this.$el.draggable();

		},
		setWidgetBinders: function() {
			rivets.binders.positionx = function(el, value) {
				el.style.left = parseInt( value, 10 ) + "px";
			};
			rivets.binders.positiony = function(el, value) {
				el.style.top = parseInt( value, 10 ) + "px";
			};
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
								this.model.set('in', model.attributes[property]);
								this.processSignalChain();
							}
							else {
								// Outs always refer to the widget's model
								model.set('out', this.model.attributes[property]);
								//this.model.set('out', model.attributes[property]);
							}
						}
					}
				}
			}

			this.onSync();
		},
		mapToSourceModel: function(model) {
		},
		processSignalChain: function() {
			this.model.set('out', this.model.get('in'));
		},

	});

});
