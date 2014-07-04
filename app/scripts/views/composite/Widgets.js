define([
	'backbone',
	'views/item/Widget',
	'hbs!tmpl/composite/Widgets_tmpl'
],
function( Backbone, Widget, WidgetsTmpl  ) {
    'use strict';

	/* Return a CompositeView class definition */
	return Backbone.Marionette.CompositeView.extend({

		initialize: function() {
			console.log("initialize a Widgets CompositeView");
			this.i = 0;
		},

    	itemView: Widget,
    	childView: Widget,

    	template: WidgetsTmpl,
		className: 'widgets',


    	/* ui selector cache */
    	ui: {},

    	/* where are we appending the items views */
    	itemViewContainer: "",

		/* Ui events hash */
		events: {},

		// Build a `childView` for a model in the collection.
		buildChildView: function(child, ChildViewClass, childViewOptions) {
			var options = _.extend({model: child}, childViewOptions);
			//console.log(new ChildViewClass({controlParameter: 'left'}).className);
			//return new ChildViewClass(options);
			var params = ['left', 'top'];
			_.extend(options, {controlParameter: params[this.i]});
			this.i++;
			return new child.view(options);
		},

		/* on render callback */
		onRender: function() {
			//console.log(this);
		}
	});

});
