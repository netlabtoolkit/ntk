define([
	'application',
	'backbone',
	'text!tmpl/ToolBar_tmpl.js',
	'views/WidgetMap',
],
function( app, Backbone, Template, Widgets ) {
    'use strict';

	return Backbone.View.extend({
		events: {
			'click .savePatch': 'savePatch',
			'click .loadPatch': 'loadPatch',
		},
		subViews: [],
		template: _.template(Template),
		className: 'toolBar',

		render: function() {
			this.el.innerHTML = this.template();

			for(var widgetName in Widgets) {
				var widgetEl = document.createElement('div');
				$(widgetEl)
					.addClass('addWidget')
					.data('widgetType', widgetName)
					.text(widgetName)
					.on('click', function(e) {
						window.app.vent.trigger('ToolBar:addWidget', $(this).data('widgetType'));
					});
				this.$el.append(widgetEl);
			}
		},
		loadPatch: function() {
			var JSONString = prompt('Paste your JSON here');
			window.app.vent.trigger('ToolBar:loadPatch', JSONString);
		},
		savePatch: function() {
			window.app.vent.trigger('ToolBar:savePatch');
		},
	});

});
