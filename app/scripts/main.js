require([
	'backbone',
	'application',
	'rivets',
	'regionManager',
],
function ( Backbone, App, rivets ) {
    'use strict';

	window.app = App;

	 //Rivets.js Backbone adapter
	rivets.adapters[':'] = {
		// set the listeners to update the corresponding DOM element
		subscribe: function(obj, keypath, callback) {
			if (obj instanceof Backbone.Collection) {
				obj.on('add remove reset', callback);
			}
			obj.on('change:' + keypath, callback);
		},
		// this will be triggered to unbind the Rivets.js events
		unsubscribe: function(obj, keypath, callback) {
			if (obj instanceof Backbone.Collection) {
				obj.off('add remove reset', callback);
			}
			obj.off('change:' + keypath, callback);
		},
		// define how Rivets.js should read the propery from our objects
		read: function(obj, keypath) {
			// if we use a collection we will loop through its models otherwise we just get the model properties
			return obj instanceof Backbone.Collection ? obj.models : obj.get(keypath);
		},
		// It gets triggered whenever we want update a model using Rivets.js
		publish: function(obj, keypath, value) {
			obj.set(keypath, value);
		}
	};

(function($) {
    $.fn.drags = function(opt) {

        opt = $.extend({handle:"",cursor:"move"}, opt);

        if(opt.handle === "") {
            var $el = this;
        } else {
            var $el = this.find(opt.handle);
        }

        return $el.css('cursor', opt.cursor).on("mousedown", function(e) {
            if(opt.handle === "") {
                var $drag = $(this).addClass('draggable');
            } else {
                var $drag = $(this).addClass('active-handle').parent().addClass('draggable');
            }
            var z_idx = $drag.css('z-index'),
                drg_h = $drag.outerHeight(),
                drg_w = $drag.outerWidth(),
                pos_y = $drag.offset().top + drg_h - e.pageY,
                pos_x = $drag.offset().left + drg_w - e.pageX;
            $drag.css('z-index', 1000).parents().on("mousemove", function(e) {
                $('.draggable').offset({
                    top:e.pageY + pos_y - drg_h,
                    left:e.pageX + pos_x - drg_w
                }).on("mouseup", function() {
                    $(this).removeClass('draggable').css('z-index', z_idx);
                });
            });
            e.preventDefault(); // disable selection
        }).on("mouseup", function() {
            if(opt.handle === "") {
                $(this).removeClass('draggable');
            } else {
                $(this).removeClass('active-handle').parent().removeClass('draggable');
            }
        });

    }
})(jQuery);

//rivets.adapters[':'] = {
  //subscribe: function(obj, keypath, callback) {
    //obj.on('change:' + keypath, callback)
  //},
  //unsubscribe: function(obj, keypath, callback) {
    //obj.off('change:' + keypath, callback)
  //},
  //read: function(obj, keypath) {
    //return obj.get(keypath)
  //},
  //publish: function(obj, keypath, value) {
    //obj.set(keypath, value)
  //}
//}
	App.start();
});
