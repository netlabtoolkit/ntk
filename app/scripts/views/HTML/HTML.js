define([
	'backbone',
	'rivets',
	'views/item/WidgetMulti',
	'text!./template.js',
],
function(Backbone, rivets, WidgetView, Template){
    'use strict';

	return WidgetView.extend({
		typeID: 'HTML',
        categories: ['UI'],
		className: 'htmlWidget',
		template: _.template(Template),
		sources: [],
        widgetEvents: {
            'mouseup .detachedEl': 'imgMoved',

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
				title: 'HTML',

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
                userHtml: "<div>\n   <div class='elementa'>temp</div>\n   <div class='elementb'>humidity</div>\n</div>",
                userCss: ".elementa {background-color: lightgray; width: 60px;}\n.elementb {background-color: #a3a3a3; width: 60px;}",
                displayClass: 'displayhtml',
                displayClassLast: 'displayhtml',
                inputElementClass: 'elementa',
                inputProperty: 'width',
                

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
            }
		},

        onModelChange: function(model) {
            if(!app.server) {
                if (model.changedAttributes().in !== undefined && model.changedAttributes().in != this.lastIn) {
                    var inputElement = '.' + this.model.get('inputElementClass');
                    var input = this.model.get('in');
                    switch(this.model.get('inputProperty')) {
                        case "width":
                            this.$(inputElement).css( "width", input + "px" );
                            break;
                        case "height": 
                            this.$(inputElement).css( "height", input + "px" );
                            break;
                        case "scale":
                            this.$(inputElement).css( "width", input + "px" );
                            this.$(inputElement).css( "height", input + "px" );
                            break;
                        case "bgcolor": 
                            this.$(inputElement).css( "background-color", input );
                            break;
                        case "text": 
                            this.$(inputElement).text( input );
                            break;
                        case "html": 
                            this.$(inputElement).html( input );
                            break;
                    }
                            
                            
                    //this.rotate(this.$('.inputElement'),this.model.get('in'),'Y');
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
        
/*        rotate: function(element,degrees,axis) {
            // rotate to specific orientation
            axis = axis || "Z";
            axis = axis.toUpperCase();
            var transRotation = '';
            switch(axis) {
                case 'X': 
                    transRotation = 'rotateX(' + degrees + 'deg)';
                    break;
                case 'Y':
                    transRotation = 'rotateY(' + degrees + 'deg)';
                    break;
                case 'Z':
                    transRotation = 'rotate(' + degrees + 'deg)'; // same as rotateZ and more compatible
                    break;
            }
            element.css({'-webkit-transform' : transRotation,
                         '-moz-transform' : transRotation,
                         '-ms-transform' : transRotation,
                         '-o-transform' : transRotation, // 3D transforms (rotateX, rotateY, rotateZ) not yet support in Opera
                         'transform' : transRotation
            });
        },*/
        
        imgMoved: function(e) {
            // position:fixed box - read raw css left/top (round-trips with
            // the rv-positionx/y binders); .offset() adds page scroll and
            // drifts the box on every move. Clamp so it stays reachable.
            var $box = this.$('.detachedEl');
            var left = parseInt($box.css('left'), 10) || 0;
            var top = parseInt($box.css('top'), 10) || 0;
            left = Math.max(0, Math.min(left, (window.innerWidth || 1200) - 60));
            top = Math.max(0, Math.min(top, (window.innerHeight || 800) - 40));
            $box.css({ left: left + 'px', top: top + 'px' });
            this.model.set('left', left);
            this.model.set('top', top);
        },

	});
});


