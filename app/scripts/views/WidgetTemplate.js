define([
	'backbone',
	'views/item/Widget',
	'text!tmpl/myWidgetTemplateName_tmpl.js',
],
function(Backbone, WidgetView, Template){
    'use strict';

	return WidgetView.extend({
		className: 'myClassName',
		template: _.template(Template),

		initialize: function(options) {
			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);
			this.model.set('title', 'MyWidget Name');

		},
        /**
         * called when widget is rendered
         *
         * @return
         */
		onRender: function() {

		},
	});
});
