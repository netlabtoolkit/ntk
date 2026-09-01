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
            'change .defaultDeviceType': 'defaultDeviceTypeChange',
            'change .defaultDeviceAddress': 'defaultDeviceServerChange',
            'change .defaultDevicePortInput': 'defaultDevicePortChange',
            'change .defaultSerialPortSelect': 'defaultDeviceServerChange',
            'mousedown .defaultDeviceSerialPortPicker': 'requestDefaultSerialPorts',
		},
		subViews: [],
		template: _.template(Template),
		className: 'toolBar',
        widgetsVisible: true,
		// Add Widgets panel display-label overrides, keyed by the real
		// internal widget type (see sortWidgetCategories()/render() below,
		// and Patcher.js's creation dispatch) - only the label shown in
		// the panel changes, nothing else reads this map.
		WIDGET_DISPLAY_NAMES: {
			'GroveSensor': 'GroveIn',
		},

		initialize: function initialize() {
			window.app.vent.on('serverActive', this.indicateServerActive, this);
			window.app.vent.on('serialPortList', this.updateDefaultSerialPortOptions, this);
		},
		render: function() {
			this.el.innerHTML = this.template();

			var sortedWidgets = this.sortWidgetCategories();

			for(var categoryName in sortedWidgets) {
				var categoryEl = document.createElement('div'),
					categoryUl = document.createElement('ul'),
                    categoryClasses = 'category cat' + categoryName.replace('/','-');

				$(categoryEl)
					.addClass(categoryClasses)
					.text(categoryName)
					.click(function categoryClick(e) {
						$(this).next('ul').toggle();
					})


					var categoryWidgets = sortedWidgets[categoryName];
					// Plain alphabetical, except GroveSensor is pinned to
					// the end of whichever category list it's in (I/O) -
					// it's new/experimental, not yet an established widget
					// type like the others alongside it.
					categoryWidgets.sort(function(a, b) {
						if(a === 'GroveSensor') { return b === 'GroveSensor' ? 0 : 1; }
						if(b === 'GroveSensor') { return -1; }
						return a < b ? -1 : (a > b ? 1 : 0);
					});

					for(var j=0; j <= categoryWidgets.length-1; j++) {
						var widgetEl = document.createElement('li'),
							widgetName = categoryWidgets[j],
                            widgetClasses = 'addWidget widget' + categoryName.replace('/','-');

						$(widgetEl)
							.addClass(widgetClasses)
							.data('widgetType', widgetName)
							// Display label only - widgetName itself (used
							// for .data('widgetType', ...) above, and for
							// everything downstream: Patcher.js's creation
							// dispatch, saved-patch widgetType strings,
							// the GroveSensor sort-pinning above) must stay
							// the real internal type, e.g. 'GroveSensor',
							// so renaming what's shown here (its on-canvas
							// title is 'GroveIn') doesn't touch any of that.
							.text(this.WIDGET_DISPLAY_NAMES[widgetName] || widgetName)
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
			fileInput.addEventListener("change", this.loadPatch.bind(this) );

			this.indicateServerActive(window.app.serverActive);
			this.initDefaultDeviceUI();
		},
		/**
		 * initDefaultDeviceUI - reflect window.app.defaultDevice in the
		 * Settings drawer's Device controls, and kick off serial port
		 * detection if it defaults to Serial.
		 *
		 * @return {void}
		 */
		initDefaultDeviceUI: function() {
			var defaultDevice = window.app.defaultDevice;

			this.$('.defaultDeviceType').val(defaultDevice.deviceType);
			this.prefillDefaultNetworkAddress();
			this.$('.defaultDeviceAddress').val(defaultDevice.deviceType === 'network' ? defaultDevice.server : '');
			this.$('.defaultDevicePortInput').val(defaultDevice.port);
			this.updateDefaultDeviceVisibility();

			if(defaultDevice.deviceType === 'ArduinoUno') {
				this.requestDefaultSerialPorts();
			}
		},
		updateDefaultDeviceVisibility: function() {
			var isNetwork = window.app.defaultDevice.deviceType === 'network';

			this.$('.defaultDeviceIp, .defaultDevicePort').toggle(isNetwork);
			this.$('.defaultDeviceSerialPortPicker').toggle(!isNetwork);
		},
		// 192.168.4.1 matches the CircuitPython Firmata firmware's SoftAP
		// mode fixed IP (see Patcher.js's getDefaultDeviceMapping) - shown
		// as an actual starting value here, not just a silent fallback,
		// whenever Network mode is picked with no real address entered yet
		// ("auto" is leftover from Serial mode, not a real IP).
		prefillDefaultNetworkAddress: function() {
			var defaultDevice = window.app.defaultDevice;

			if(defaultDevice.deviceType === 'network' && (!defaultDevice.server || defaultDevice.server === 'auto')) {
				defaultDevice.server = '192.168.4.1';
			}
		},
		defaultDeviceTypeChange: function() {
			window.app.defaultDevice.deviceType = this.$('.defaultDeviceType').val();
			this.prefillDefaultNetworkAddress();
			this.$('.defaultDeviceAddress').val(window.app.defaultDevice.deviceType === 'network' ? window.app.defaultDevice.server : '');
			this.updateDefaultDeviceVisibility();
			this.persistDefaultDevice();

			if(window.app.defaultDevice.deviceType === 'ArduinoUno') {
				this.requestDefaultSerialPorts();
			}
		},
		// Bound to both the ip text input (Network mode) and the serial port
		// select (Serial mode) - like a widget's own Device panel, both
		// write into the same underlying "server" field.
		defaultDeviceServerChange: function(e) {
			window.app.defaultDevice.server = $(e.currentTarget).val();
			this.persistDefaultDevice();
		},
		defaultDevicePortChange: function() {
			window.app.defaultDevice.port = parseInt(this.$('.defaultDevicePortInput').val(), 10) || 3030;
			this.persistDefaultDevice();
		},
		/**
		 * persistDefaultDevice - save window.app.defaultDevice to
		 * localStorage so the last IP/port/type entered here is what
		 * shows up on the next launch (see application.js, which reads
		 * this same key at startup) instead of always resetting to the
		 * hardcoded fallback.
		 *
		 * @return {void}
		 */
		persistDefaultDevice: function() {
			try {
				localStorage.setItem('ntk.defaultDevice', JSON.stringify(window.app.defaultDevice));
			}
			catch(e) {
				// Not fatal - just means the default won't be remembered next launch.
			}
		},
		requestDefaultSerialPorts: function() {
			window.app.vent.trigger('listSerialPorts');
		},
		updateDefaultSerialPortOptions: function(ports) {
			var $select = this.$('.defaultSerialPortSelect'),
				currentValue = window.app.defaultDevice.server;

			$select.find('option.detectedPort').remove();

			_.each(ports, function(port) {
				var label = port.manufacturer ? port.path + ' (' + port.manufacturer + ')' : port.path;
				$select.append('<option class="detectedPort" value="' + port.path + '">' + label + '</option>');
			});

			$select.val(currentValue || 'auto');
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
						var category = widgetCategories[j].toUpperCase();

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
			var fileInput = this.$('#patchFileUpload')[0];
			fileInput.addEventListener("change", this.loadPatch.bind(this) );
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
			// Exporting a copy to a file should not have the side effect
			// of also silently overwriting the live server-side patch -
			// those are two different user intents (download a snapshot
			// vs. persist the current state as what reloads next launch).
			// This used to fire ToolBar:savePatch first "just in case" -
			// removed; exportPatch() already reads directly from the
			// live in-memory widget models, it was never depending on
			// the save having happened first.
			window.app.vent.trigger('ToolBar:exportPatch');
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
