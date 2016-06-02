define([
	'application',
],
function(app){

	var PatchLoader = function(options) {
		this.serverAddress = options.serverAddress,
		this.addFunction = options.addFunction,
		this.mapFunction = options.mapFunction;
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

			//this.largestCID = _.map(widgets, function(widget) { return widget.model.get('wid');}).sort()[0];
			console.log('widgets', widgets[0]);
			this.largestCID = widgets.length > 0 ? parseInt(_.map(widgets, function(widget) { return widget.wid;}).sort()[0].slice(1), 10) : 0;
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

				// If we have both it means that we are looking at a widget to widget mapping (not a device model)
				if(modelSourceView && widgetView) {

					this.mapFunction({
						model: modelSourceView.model,
						IOMapping: mappings[i].map,
						view: widgetView,
						inletOffsets: mappings[i].offsets,
						server: window.location.host
					}, true);
				}
				// Otherwise we must be mapping a widget to a device model
				else {

					this.mapFunction({
						view: widgetView,
						modelType: mappings[i].modelWID, // Expectin modeWID to be a descriptive string in this case
						IOMapping: mappings[i].map,
						server: window.location.host
					}, true);
				}

			}

		},

	};

	return PatchLoader;
});
