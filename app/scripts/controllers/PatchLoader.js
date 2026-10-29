define([
	'application',
],
function(app){

	var PatchLoader = function(options) {
		this.serverAddress = options.serverAddress,
		this.addFunction = options.addFunction,
		this.mapFunction = options.mapFunction,
		this.updateLargestCID = options.updateLargestCID;
	};

	PatchLoader.prototype = {
		save: function(collection, mappings) {
			//var saveWindow = window.open(),
				//saveConfig = {
					//widgets: collection,
					//mappings: mappings,
				//}

			//saveWindow.document.write(JSON.stringify(saveConfig));
		},
		loadJSON: function(JSONString, save) {
			var loadConfig = JSON.parse(JSONString);

			var widgets = loadConfig.widgets,
				mappings = loadConfig.mappings,
				widgetViews = [];

			if(save) {
				window.app.vent.trigger('savePatchToServer', {collection: widgets, mappings: mappings});
			}
			else {
				window.app.vent.trigger('loadPatchFileToServer', {widgets: widgets, mappings: mappings});
			}

			// Bump the Patcher's own id counter (not this PatchLoader
			// instance - it never adds widgets itself, so a counter
			// scoped to it would be dead code, which is exactly what
			// used to be here) past every id this file uses, before any
			// widget is actually added. Without this, a widget added
			// after loading this patch can mint an id ("n" + counter)
			// that collides with one already in the file - see
			// Patcher.js's updateLargestCID for the fuller story.
			if(this.updateLargestCID) {
				for(var c=widgets.length-1; c>=0; c--) {
					this.updateLargestCID(widgets[c].wid);
				}
			}
			// Add all widgets
			for(var i=widgets.length-1; i>=0; i--) {
				var newWidget = this.addFunction(widgets[i].typeID, true, widgets[i].wid);
				// after adding the widget, duplicate the settings by passing them to the widget's own method for doing that
				newWidget.setFromModel(widgets[i]);

				widgetViews.push(newWidget);
			}

			// Add all mappings
			for(var i=mappings.length-1; i>=0; i--) {
				// Find the actual model that matches the widget ID (wid)
				var modelSourceView = _.find(widgetViews, function(view) {return mappings[i].modelWID == view.model.get('wid')} ),
					widgetView = _.find(widgetViews, function(view) {return mappings[i].viewWID == view.model.get('wid')} )

				// A mapping for a widget the patch doesn't have - skip it
				// rather than let mapToModel throw on the missing view,
				// which aborted the whole load (every mapping after it
				// was never made). Seen 2026-10-29 in the server's copy
				// after a Pull: mappings with no widgets at all.
				if(!widgetView) {
					console.warn('PatchLoader: skipping a mapping for widget', mappings[i].viewWID, '- not in this patch');
					continue;
				}

				// If we have both it means that we are looking at a widget to widget mapping (not a device model)
				if(modelSourceView && widgetView) {

					this.mapFunction({
						model: modelSourceView.model,
						IOMapping: mappings[i].map,
						view: widgetView,
						inletOffsets: mappings[i].offsets,
						server: window.location.host == "localhost:9001" ? "127.0.0.1:9001" : window.location.host
					}, true);
				}
				// Otherwise we must be mapping a widget to a device model
				else {

					var typeServerPort = mappings[i].modelWID.split(":");
					var modelType = typeServerPort[0],
						server = typeServerPort[1],
						port = typeServerPort[2];

					this.mapFunction({
						view: widgetView,
						modelType: modelType, // Expectin modeWID to be a descriptive string in this case
						IOMapping: mappings[i].map,
						server: server + ":" + port
					}, true);
				}

			}

		},

	};

	return PatchLoader;
});
