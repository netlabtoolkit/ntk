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
			'click .downloadPatch': 'downloadPatch',
			'click .loadPatch': 'showUploadFileDialog',
			'click .clearPatch': 'clearPatch',
            'click .hideWidgets': 'hideWidgets',
            'click .fullScreen': 'fullScreen',
            'click .serverSwitch': 'toggleServer',
            'click .openAddWidgets': 'toggleAddWidgetsPanel',
            'click .openSettings': 'toggleSettingsPanel',
		},
		subViews: [],
		template: _.template(Template),
		className: 'toolBar',
        widgetsVisible: true,

		initialize: function initialize() {
			window.app.vent.on('serverActive', this.indicateServerActive, this);
		},
		render: function() {
			this.el.innerHTML = this.template();

			var sortedWidgets = this.sortWidgetCategories();

			for(var categoryName in sortedWidgets) {
				var categoryEl = document.createElement('div'),
					categoryUl = document.createElement('ul');

				$(categoryEl)
					.addClass('category')
					.text(categoryName)
					.click(function categoryClick(e) {
						$(this).next('ul').toggle();
					})


					var categoryWidgets = sortedWidgets[categoryName];
					categoryWidgets.sort();

					for(var j=0; j <= categoryWidgets.length-1; j++) {
						var widgetEl = document.createElement('li'),
							widgetName = categoryWidgets[j]
						
						$(widgetEl)
							.addClass('addWidget')
							.data('widgetType', widgetName)
							.text(widgetName)
							.on('click', function(e) {
								e.preventDefault();
								e.stopPropagation();

								if(window.app.serverMode) {
									window.app.trigger('RestrictiveOverlay:showMessage', e);

									return false;
								}

								window.app.vent.trigger('ToolBar:addWidget', $(this).data('widgetType'));
							});

						$(categoryUl).append(widgetEl);

					}

					this.$('.addWidgets').append(categoryEl);
					$(categoryEl).after(categoryUl);

			}

			var fileInput = this.$('#patchFileUpload')[0];
			fileInput.addEventListener("change", this.loadPatch);

			this.indicateServerActive(window.app.serverActive);
		},
		/**
		 * Sort all widgets into a categories object
		 *
		 * @return {object}
		 */
		sortWidgetCategories: function sortCategories() {
			//var categories = {all: []};
            var categories = {};


			for(var widgetName in Widgets) {
				var widget = Widgets[widgetName].prototype;

				if(widget.categories.length > 0) {
					var widgetCategories = widget.categories;
					for(var j=widgetCategories.length-1; j>=0; j--) {
						var category = widgetCategories[j];

						if(categories[category] == undefined) {
							categories[category] = [];
						}

						categories[category].push(widgetName);
					}
				}

				//categories.all.push(widgetName);
			}

			return categories;
		},
		showUploadFileDialog: function(e) {
			if(!window.app.serverMode) {
				this.$('#patchFileUpload').click();
			}
			else {
				window.app.trigger('RestrictiveOverlay:showMessage', e);
			}
		},
		loadPatch: function(e) {
			if(window.app.serverMode) {
				window.app.trigger('RestrictiveOverlay:showMessage', e);
				return false;
			}
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
			fileInput.addEventListener("change", this.loadPatch);
		},
		savePatch: function() {
			window.app.vent.trigger('ToolBar:savePatch');
		},
		clearPatch: function(e) {
			if(!window.app.serverMode) {
				window.app.vent.trigger('ToolBar:clearPatch');
			}
			else {
				window.app.trigger('RestrictiveOverlay:showMessage', e);
			}
		},
		downloadPatch: function() {
			window.app.vent.trigger('ToolBar:savePatch');
			window.location.href = "/patch.ntk";
		},
        hideWidgets: function() {
			this.widgetsVisible = !this.widgetsVisible;

			if (this.widgetsVisible) {
				//if(window.app.serverMode) {
					//window.app.trigger('RestrictiveOverlay:show');
				//}

				$( ".widgetAuthoring" ).show('fast');
				$( "svg" ).show('fast');
				$( ".patchCableParent" ).show('fast');
			} else {
				//window.app.trigger('RestrictiveOverlay:hide');

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
				$serverSwitchButton.text('Edit OFF');
				window.app.trigger('RestrictiveOverlay:show');
			}
			else {
				$serverSwitchButton.removeClass('serverActive');
				$serverSwitchButton.text('Edit ON');
				window.app.trigger('RestrictiveOverlay:hide');
			}
		},
		toggleAddWidgetsPanel: function toggleAddWidgets() {
			this.$('.menuBar, .addWidgets').toggleClass('open');
		},
		toggleSettingsPanel: function toggleAddWidgets() {
			this.$('.settings').toggleClass('open');
		},
	});

});
