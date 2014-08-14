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
	});

});
