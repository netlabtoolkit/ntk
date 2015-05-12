define([
	'backbone',
	'rivets',
	'views/item/WidgetMulti',
	'text!./template.js',
],
function(Backbone, rivets, WidgetView, Template){
    'use strict';

	return WidgetView.extend({
		typeID: 'Text',
		className: 'text',
		template: _.template(Template),
		sources: [],
        widgetEvents: {
            'mouseup .detachedEl': 'imgMoved',
            'change #displayWidth': 'updateDisplay',
            'change #displayFontFamily': 'updateDisplay',
            'change #displayFontSize': 'updateDisplay',
            'change #displayFontColor': 'updateDisplay',
            'change #displayFontItalic': 'updateDisplay',
            'change #displayFontBold': 'updateDisplay',
		},

		initialize: function(options) {
			WidgetView.prototype.initialize.call(this, options);

			this.model.set({
				ins: [
					{title: 'in', to: 'in'},
                    {title: 'X Position', to: 'left'},
					{title: 'Y Position', to: 'top'},
                    {title: 'opacity', to: 'opacity'},
				],
				title: 'Text',

                activeControlParameter: 'left',
				controlParameters: [
					{
						name: 'X',
						parameter: 'left',
					},
					{
						name: 'Y',
						parameter: 'top',
					},
					{
						name: 'opacity',
						parameter: 'opacity',
					},
				],
				left: 250,
                top: 200,
				opacity: 100,
                displayWidth: 500,
                displayFont: "Arial, Helvetica, sans-serif",
                displayFontSize: "30px",
                displayFontColor: "#000000",
                displayFontItalic: false,
                displayFontBold: false,
                in: "Populus uxor antehabeo validus turpis dignissim verto si consequat consequat quadrum.",


			});


            this.domReady = false;

		},

        onRender: function() {
			WidgetView.prototype.onRender.call(this);
			//var self = this;
            if(!app.server) {
                this.$( '.detachedEl' ).css( 'cursor', 'move' );
                this.$( '.detachedEl' ).css( 'position', 'fixed' );
                this.$( '.detachedEl' ).draggable({ cursor: "move" });

                this.domReady = true;
                
                this.updateDisplay();
            }
		},

        onModelChange: function(model) {
            if(!app.server  && (model.changedAttributes().in !== undefined)) {
                this.model.set('displayText',this.model.get('in'));
                //console.log(this.model.get('in'));
            }
        },
        
        updateDisplay: function(e) {
            if(!app.server) {
                var weight = "normal";
                var style = "normal";

                if (this.model.get('displayFontItalic')) style = "italic";
                if (this.model.get('displayFontBold')) weight = "bold";

                this.$( '.detachedEl' ).css( 'width', this.model.get('displayWidth'));
                this.$( '.displayText' ).css( 'font-family', this.model.get('displayFont'));
                this.$( '.displayText' ).css( 'font-size', this.model.get('displayFontSize'));
                this.$( '.displayText' ).css( 'font-style', style);
                this.$( '.displayText' ).css( 'font-weight', weight);
                this.$( '.displayText' ).css( 'color', this.model.get('displayFontColor'));
            }
        },
        
        imgMoved: function(e) {
            var offset = this.$('.detachedEl').offset();
            this.model.set('left',offset.left);
            this.model.set('top',offset.top);
        },

	});
});


