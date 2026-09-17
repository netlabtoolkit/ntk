define([],
function () {
	'use strict';

	// typeIDs the v1 on-device interpreter can evaluate: pure math/logic/
	// timers/GPIO, no browser API dependency. See plans/standalone-patch-
	// export.md's "Grounding facts" section for the full classification.
	//
	// This list is hardcoded rather than derived from each widget's own
	// `categories` field - category alone isn't a reliable signal. Code
	// is tagged 'logic' but is arbitrary user-authored JavaScript (eval'd
	// via CodeMirror), which no CircuitPython interpreter can run; it's
	// deliberately left out despite the category match.
	var PORTABLE_TYPE_IDS = [
		'AnalogIn', 'AnalogOut', 'DigitalIn', 'DigitalOut', 'Servo', 'GroveSensor',
		'IfThen', 'Boolean', 'Gate', 'Mix', 'Splitter', 'Process', 'Count', 'Concat',
		'Pulse', 'Sequence', 'Tween', 'Data',
	];

	return {
		PORTABLE_TYPE_IDS: PORTABLE_TYPE_IDS,

		/**
		 * checkPatch - which widgets in a saved/exported patch (the same
		 * {widgets, mappings} shape Patcher#exportPatch/PatchLoader#loadJSON
		 * use) the v1 standalone interpreter can't run.
		 *
		 * @param {object} patch {widgets: [...], mappings: [...]}
		 * @return {object} {compatible: boolean, unsupportedWidgets: [{wid, typeID, title}]}
		 */
		checkPatch: function(patch) {
			var widgets = (patch && patch.widgets) || [],
				unsupportedWidgets = [];

			for(var i = 0; i < widgets.length; i++) {
				var widget = widgets[i];

				if(PORTABLE_TYPE_IDS.indexOf(widget.typeID) === -1) {
					unsupportedWidgets.push({
						wid: widget.wid,
						typeID: widget.typeID,
						title: widget.title,
					});
				}
			}

			return {
				compatible: unsupportedWidgets.length === 0,
				unsupportedWidgets: unsupportedWidgets,
			};
		},
	};
});
