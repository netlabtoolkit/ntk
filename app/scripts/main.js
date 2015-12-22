require.config({

    baseUrl: "/scripts",

    /* starting point for application */
    //deps: ['backbone.marionette', 'main'],


    shim: {
		jqueryui: {
			exports: 'jqueryui',
            deps: [
                'jquery'
            ],
		},
		jquerytouchpunch: {
			exports: 'jquerytouchpunch',
            deps: [
                'jquery',
                'jqueryui',
            ],
		},
        backbone: {
            deps: [
                'underscore',
                'jquery'
            ],
            exports: 'Backbone'
        },
        codemirror: {
            deps: ['jquery'],
            exports: 'codemirror'
        },
        jqueryknob: {
            exports: 'jqueryknob',
            deps: [
                'jquery'
            ],
        },
        velocity: {
            exports: 'velocity',
            deps: [ "jquery" ]
        },
        "velocity-ui": {
            exports: 'velocity-ui',
            deps: [ "velocity" ]
        },
    },

    paths: {
        jquery: '../bower_components/jquery/jquery',
        jqueryui: '../bower_components/jqueryui/jquery-ui',
        jquerytouchpunch: '../bower_components/jquery-ui-touch-punch-improved/jquery.ui.touch-punch-improved',
        jqueryknob: '../bower_components/jquery-knob/js/jquery.knob',
        velocity: '../bower_components/velocity/velocity',
        'velocity-ui': '../bower_components/velocity/velocity.ui',
        backbone: '../bower_components/backbone-amd/backbone',
        underscore: '../bower_components/underscore-amd/underscore',
        codemirror: '../bower_components/codemirror/lib/codemirror',

        /* alias all marionette libs */
        'backbone.marionette': '../bower_components/backbone.marionette/lib/core/backbone.marionette',
        'backbone.wreqr': '../bower_components/backbone.wreqr/lib/backbone.wreqr',
        'backbone.babysitter': '../bower_components/backbone.babysitter/lib/backbone.babysitter',

        /* Alias text.js for template loading and shortcut the templates dir to tmpl */
        text: '../bower_components/requirejs-text/text',
        tmpl: "../templates",

        rivets: '../bower_components/rivets/dist/rivets',
        cableManager: '../bower_components/cable-manager/CableManager',
    },

});


require([
	'backbone',
	'application',
	'rivets',
	'regionManager',
],
function (Backbone, App, rivets ) {
    'use strict';


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

	rivets.formatters.exists = function exists(value) {
	  return value !== undefined && value.length > 0;
	};

	rivets.formatters.hardwareOutput = {
		read: function(outputMapping) {
			if(outputMapping !== undefined && outputMapping.length !== 0) {

				var existingMappings = _.filter(window.app.Patcher.Controller.widgetMappings, function(map) {
					return map.map.destinationField === outputMapping;
				});

				if(existingMappings.length > 1) {
					alert('This port cannot be used as it is already in use by another widget.');

					return "";
				}
			}

			return outputMapping;
		},
		publish: function(outputMapping) {
			if(outputMapping !== undefined && outputMapping.length !== 0) {

				var existingMappings = _.filter(window.app.Patcher.Controller.widgetMappings, function(map) {
					return map.map.destinationField === outputMapping;
				});

				if(existingMappings.length > 1) {
					return "";
				}
			}

			return outputMapping;
		}
	}
	App.start();
});
