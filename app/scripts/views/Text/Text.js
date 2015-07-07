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
        categories: ['media'],
		className: 'text',
		template: _.template(Template),
		sources: [],
        widgetEvents: {
            'mouseup .detachedEl': 'imgMoved',
            'change .displayWidth': 'updateDisplay',
            'change .displayFontFamily': 'updateDisplay',
            'change .displayFontSize': 'updateDisplay',
            'change .displayFontColor': 'updateDisplay',
            'change .displayFontItalic': 'updateDisplay',
            'change .displayFontBold': 'updateDisplay',
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
				appendText: false,
                left: 250,
                top: 200,
				opacity: 100,
                displayWidth: 500,
                displayFont: "Arial, Helvetica, sans-serif",
                displayFontSize: "30px",
                displayFontColor: "#000000",
                displayFontItalic: false,
                displayFontBold: false,
                displayClass: 'displaytext',
                displayClassLast: 'displaytext',
                in: "Populus uxor antehabeo validus turpis dignissim verto si consequat quadrum.",


			});


            this.domReady = false;
            this.lastIn = -1;
            

		},

        onRender: function() {
			WidgetView.prototype.onRender.call(this);
			//var self = this;
            if(!app.server) {
                this.$( '.detachedEl' ).css( 'cursor', 'move' );
                this.$( '.detachedEl' ).css( 'position', 'fixed' );
                this.$( '.detachedEl' ).draggable({ cursor: "move" });
                
                this.textDiv = this.$('.displaytext');
                this.domReady = true;
                this.updateDisplay();
            }
		},

        onModelChange: function(model) {
            if(!app.server) {
                if (model.changedAttributes().in !== undefined && model.changedAttributes().in != this.lastIn) {
                    if (this.model.get('appendText')) {
                        this.model.set('displayText',this.model.get('displayText') + " " + this.model.get('in'));
                    } else {
                        this.model.set('displayText',this.model.get('in'));
                    }
                }
                this.lastIn = model.changedAttributes().in;
                if (model.changedAttributes().displayClass !== undefined && this.domReady) {
                    var lastClass = this.model.get('displayClassLast');
                    var newClass = this.model.get('displayClass');
                    this.textDiv.removeClass(lastClass).addClass(newClass);
                    this.model.set('displayClassLast',newClass)
                }
            }
        },
        
        updateDisplay: function(e) {
            if(!app.server) {
                var weight = "normal";
                var style = "normal";
                var displayClass = '.' + this.model.get('displayClass');

                if (this.model.get('displayFontItalic')) style = "italic";
                if (this.model.get('displayFontBold')) weight = "bold";

                this.$( '.detachedEl' ).css( 'width', this.model.get('displayWidth'));
                this.textDiv.css( 'font-family', this.model.get('displayFont'));
                this.textDiv.css( 'font-size', this.model.get('displayFontSize'));
                this.textDiv.css( 'font-style', style);
                this.textDiv.css( 'font-weight', weight);
                this.textDiv.css( 'color', this.model.get('displayFontColor'));
            }
        },
        
        imgMoved: function(e) {
            var offset = this.$('.detachedEl').offset();
            this.model.set('left',offset.left);
            this.model.set('top',offset.top);
        },

	});
});


