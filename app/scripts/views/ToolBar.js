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
            'click .hideWidgets': 'hideWidgets',
            'click .fullScreen': 'fullScreen',
		},
		subViews: [],
		template: _.template(Template),
		className: 'toolBar',
        widgetsVisible: true,

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
        hideWidgets: function() {
            this.widgetsVisible = !this.widgetsVisible;
            if (this.widgetsVisible) {
                self.$( ".widgetAuthoring" ).show('fast');
                self.$( ".patchCableParent" ).show('fast');
            } else {
                self.$( ".widgetAuthoring" ).hide('fast');
                self.$( ".patchCableParent" ).hide('fast');
            }
        },
        fullScreen: function() {
            var el = document.getElementById("patcherRegion")
            if(el.requestFullscreen) {
                el.requestFullscreen();
            } else if(el.mozRequestFullScreen) {
                el.mozRequestFullScreen();
            } else if(el.webkitRequestFullscreen) {
                el.webkitRequestFullscreen();
            } else if(el.msRequestFullscreen) {
                el.msRequestFullscreen();
            }
        },
	});

});
