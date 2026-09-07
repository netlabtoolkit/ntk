define([
	'backbone',
	'rivets',
	'views/item/WidgetMulti',
	'text!./template.js',
],
function(Backbone, rivets, WidgetView, Template){
    'use strict';

	return WidgetView.extend({
		typeID: 'Image',
		categories: ['media'],
		className: 'image',
		template: _.template(Template),
		sources: [],

        widgetEvents: {
			'mouseup .detachedEl': 'imgMoved',
      'change .displayWidth': 'setImageDimensions',
      'change .srcFile': 'srcFileChange',
      'click .browseImage': 'browseImage',
		},
		initialize: function(options) {
			WidgetView.prototype.initialize.call(this, options);

			this.model.set({
				src: 'assets/images/ntk_logo.jpg',
        srcFile: 'ntk_logo.jpg',
        localImagePath: null,
				ins: [
					//{name: 'in', to: 'in'},
					{title: 'X Position', to: 'left'},
					{title: 'Y Position', to: 'top'},
          {title: 'opacity', to: 'opacity'},
          {title: 'width', to: 'displayWidth'},
				],
				title: 'Image',
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
        displayWidth: 500,
        left: 100,
        top: 200,
				opacity: 100,
			});
		},

        onRender: function() {
    		  WidgetView.prototype.onRender.call(this);

    			var self = this;
          if(!app.server) {
            this.$( '.detachedEl' ).css( 'cursor', 'move' );
            this.$( '.detachedEl' ).css( 'position', 'fixed' );
            this.$( '.detachedEl' ).draggable({ cursor: 'move' });
            this.setImageDimensions();
          }
    		},

        onModelChange: function(model) {
            if(model.changedAttributes().displayWidth !== undefined) {
              this.setImageDimensions();
            }
          },

        imgMoved: function(e) {
            // position:fixed box - read the raw css left/top (round-trips
            // with the rv-positionx/y binders); .offset() adds page scroll
            // and drifts the box on every move. Clamp so it stays reachable.
            var $box = this.$('.detachedEl');
            var left = parseInt($box.css('left'), 10) || 0;
            var top = parseInt($box.css('top'), 10) || 0;
            left = Math.max(0, Math.min(left, (window.innerWidth || 1200) - 60));
            top = Math.max(0, Math.min(top, (window.innerHeight || 800) - 40));
            $box.css({ left: left + 'px', top: top + 'px' });
            this.model.set('left', left);
            this.model.set('top', top);
            this.sendToFront();
        },

        sendToFront: function() {
            var index_highest = 0;
            $(".widget").each(function () {
                index_highest = Math.max(parseInt($(this).zIndex()), index_highest);
            });

            this.$el.zIndex(index_highest + 1);
        },

        setImageDimensions: function() {
            if(!app.server) {
                this.$( '.detachedEl' ).css( 'width', this.model.get('displayWidth'));
            }
        },

        srcFileChange: function() {
          // Typing a bundled asset filename should take back over from a
          // previously browsed-to local file, not be silently ignored.
          this.model.set('localImagePath', null);
          this.setSrc();
        },

        setSrc: function() {
          var localImagePath = this.model.get('localImagePath');

          if (localImagePath) {
            // Served through /localImage (see routes.js) rather than as a direct
            // file:// src - Chromium blocks file:// loads from a page loaded
            // over http, which is how this app's renderer is loaded.
            this.model.set('src', '/localImage?path=' + encodeURIComponent(localImagePath));
          }
          else {
            this.model.set('src','assets/images/' + this.model.get('srcFile'));
          }
        },

        browseImage: function() {
          if (!window.ntkElectron) {
            // Not running inside the Electron app (e.g. a remote browser client) -
            // no local file picker available, fall back to the assets/images field.
            return;
          }

          var self = this;
          window.ntkElectron.pickImageFile().then(function(filePath) {
            if (filePath) {
              self.model.set('localImagePath', filePath);
              self.setSrc();
            }
          });
        },

	});
});
