define([
	'application',
	'backbone',
	'text!tmpl/ToolBar_tmpl.js',
	'views/WidgetMap',
],
function( app, Backbone, Template, Widgets ) {
    'use strict';

	var self;

	return Backbone.View.extend({
		events: {
			'click .savePatch': 'savePatch',
			'click .downloadPatch': 'downloadPatch',
			'click .loadPatch': 'showUploadFileDialog',
			'click .clearPatch': 'clearPatch',
            'click .hideWidgets': 'hideWidgets',
            'click .fullScreen': 'fullScreen',
            'click .serverSwitch': 'toggleServer',
		},
		subViews: [],
		template: _.template(Template),
		className: 'toolBar',
        widgetsVisible: true,

		initialize: function initialize() {
			window.app.vent.on('serverActive', this.indicateServerActive, this);
		},
		render: function() {
			self = this;
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

			var fileInput = this.$('#patchFileUpload')[0];
			fileInput.addEventListener("change", this.loadPatch);

			this.indicateServerActive(window.app.serverActive);
		},
		showUploadFileDialog: function() {
			this.$('#patchFileUpload').click();
		},
		loadPatch: function(e) {
			//var JSONString = prompt('Paste your JSON here');
			//window.app.vent.trigger('ToolBar:loadPatch', JSONString, true);
			
			var fileInput = document.getElementById('patchFileUpload');
			var formData = new FormData();
			if(fileInput.files.length > 0) {
				formData.append("patch", fileInput.files[0]);
			}

			$.ajax({
				url: "/loadPatch",
				type: "POST",
				data: formData,
				processData: false,
				contentType: false,
				success: function (res) {
					console.log('patch uploaded');
				}
			});

			// Reset the form so you can re-upload the same file
			$('.inputForm').empty();
			$('.inputForm').append('<input type="file" name="images" id="patchFileUpload" style="display:none" />');
			var fileInput = $('#patchFileUpload')[0];
			fileInput.addEventListener("change", self.loadPatch);
		},
		savePatch: function() {
			window.app.vent.trigger('ToolBar:savePatch');
		},
		clearPatch: function() {
			window.app.vent.trigger('ToolBar:clearPatch');
		},
		downloadPatch: function() {
			window.app.vent.trigger('ToolBar:savePatch');
			window.location.href = "/patch.nlp";
		},
        hideWidgets: function() {
			this.widgetsVisible = !this.widgetsVisible;

			if (this.widgetsVisible) {
				$( ".widgetAuthoring" ).show('fast');
				$( "svg" ).show('fast');
				$( ".patchCableParent" ).show('fast');
			} else {
				$( ".widgetAuthoring" ).hide('fast');
				$( "svg" ).hide('fast');
				$( ".patchCableParent" ).hide('fast');
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
		/**
		 * Toggle control between the autonomous server and this web-based client
		 *
		 * @return {undefined}
		 */
		toggleServer: function() {
			window.app.vent.trigger('ToolBar:toggleServer');
		},
		indicateServerActive: function indicateServerActive(serverActive) {
			var $serverSwitchButton = this.$('.serverSwitch');
			if(serverActive) {
				$serverSwitchButton.addClass('serverActive');
				$serverSwitchButton.text('Inactive');
			}
			else {
				$serverSwitchButton.removeClass('serverActive');
				$serverSwitchButton.text('Active');
			}
		},
	});

});
