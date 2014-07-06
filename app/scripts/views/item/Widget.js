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

			if(this.destinationModel) {
				rivets.bind(this.$el, {widget: this.model});
				this.listenTo(this.destinationModel, 'change', this.syncWithDestinationModel);
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
        /**
         * Takes the attributes from the destinationModel and maps them onto the selected attributes of the Widget's model
         *
         * @param model
         * @return
         */
		syncWithDestinationModel: function(model) {
			//console.log('sync', model);
			// Check if there is a mapping for the attribute given and map it if so
			for(var property in model.attributes) {

				for(var widgetProperty in this.model.attributes) {

					if(this.model.attributes[widgetProperty] === property) {
						if(widgetProperty === 'inputMapping') {
							this.model.set('in', model.attributes[property]);
						}
						else {
							this.model.set('out', model.attributes[property]);
						}
					}
				}
			}
		},

	});

});
