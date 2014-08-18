define([
	'application',
],
function(app){

	var PatchLoader = function(options) {

		window.WW = this;
		this.serverAddress = options.serverAddress,
		this.addFunction = options.addFunction,
		this.mapFunction = options.mapFunction;
	};

	PatchLoader.prototype = {
		save: function(collection) {
			var saveWindow = window.open();
			saveWindow.document.write(JSON.stringify(collection));
		},
		loadJSON: function(JSONString) {
			var widgets = JSON.parse(JSONString);

			for(var i=widgets.length-1; i>=0; i--) {
				var newWidget = this.addFunction(widgets[i].typeID);
				// after adding the widget, duplicate the settings by passing them to the widget's own method for doing that
				newWidget.setFromModel(widgets[i]);
			}
		},

	};

	return PatchLoader;
});
