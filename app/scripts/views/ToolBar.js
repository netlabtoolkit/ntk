define([
	'application',
	'backbone',
	'text!tmpl/ToolBar_tmpl.js'
],
function( app, Backbone, Template  ) {
    'use strict';

	return Backbone.View.extend({
		events: {
			'click .addWidget': 'addWidget',
			'click .savePatch': 'savePatch',
			'click .loadPatch': 'loadPatch',
		},
		subViews: [],
		template: _.template(Template),
		className: 'toolBar',

		render: function() {
			this.el.innerHTML = this.template();
		},
		addWidget: function(e) {
			var widgetType = "";
			if($(e.target).hasClass('analogIn')) {
				widgetType = 'analogIn';
			}
			else if($(e.target).hasClass('analogOut')) {
				widgetType = 'analogOut';
			}
			else if($(e.target).hasClass('elementControl')) {
				widgetType = 'elementControl';
			}
			else if($(e.target).hasClass('addCode')) {
				widgetType = 'code';
			}
			else if($(e.target).hasClass('blank')) {
				widgetType = 'blank';
			}

			window.app.vent.trigger('ToolBar:addWidget', widgetType);
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
