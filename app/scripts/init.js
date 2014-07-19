require.config({

    baseUrl: "/scripts",

    /* starting point for application */
    deps: ['backbone.marionette', 'main'],


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
    },

    paths: {
        jquery: '../bower_components/jquery/jquery',
        jqueryui: '../bower_components/jqueryui/jquery-ui',
        jquerytouchpunch: '../bower_components/jquery-ui-touch-punch-improved/jquery.ui.touch-punch-improved',
        jqueryknob: '../bower_components/jquery-knob/js/jquery.knob',
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

        /* require handlebars plugin - Alex Sexton */
        //i18nprecompile: '../bower_components/require-handlebars-plugin/hbs/i18nprecompile',
        //json2: '../bower_components/require-handlebars-plugin/hbs/json2',
        //hbs: '../bower_components/require-handlebars-plugin/hbs',
        rivets: '../bower_components/rivets/dist/rivets',
    },

    //hbs: {
        //disableI18n: true
    //}
});
