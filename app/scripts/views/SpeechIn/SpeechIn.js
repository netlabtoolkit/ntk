define([
	'backbone',
    'rivets',
	'views/item/WidgetMulti',
	'text!./template.js',

	// If you would like signal processing classes and functions include them here
	'utils/SignalChainFunctions',
	'utils/SignalChainClasses',
],
function(Backbone, rivets, WidgetView, Template, SignalChainFunctions, SignalChainClasses){
    'use strict';

	return WidgetView.extend({
		// Map inputs to model
		ins: [
			// title: decorative, to: <widget model field>
			{title: 'in1', to: 'in1'},
		],
		outs: [
			// title: decorative, from: <widget model field>, to: <widget model field being listened to>
			{title: 'out1', from: 'output', to: 'out1'},
		],
        
        widgetEvents: {
            'blur .database': 'outputText',
            'change .select_language': 'updateCountry',
        },
		sources: [],
		typeID: 'SpeechIn',
		className: 'speechin',
        categories: ['generator'],
		template: _.template(Template),

		initialize: function(options) {

			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);
            
            // Call any custom DOM events here
            this.model.set({
                title: 'SpeechIn',
                in1: 0,
				output: "",
                threshold: 512,
                lastIn: -1,
                final_transcript: '',
                recognizing: false,
                ignore_onend: false,
                start_timestamp: 0,
                continuous: false,
                language: 6,
                dialect: 'en-US',
                
            });
            

		},
        /**
         * called when widget is rendered
         *
         * @return
         */
		onRender: function() {
			WidgetView.prototype.onRender.call(this);

            var self = this;
            self.model.set('output','');
            self.model.set('final_transcript','');
            
            // setup speach recognition
            if (!('webkitSpeechRecognition' in window)) {
                alert("Browser not supported for speech recognition");
            } else {
                this.select_language = this.$( '.select_language' ).get(0);
                this.select_dialect = this.$( '.select_dialect' ).get(0);
                this.setLanguages();
                
                
                this.recognition = new webkitSpeechRecognition();
                this.recognition.continuous = true;
                this.recognition.interimResults = true;
                
                var self = this;

                this.recognition.onstart = function() {
                    self.model.set('recognizing',true);
                    //showInfo('info_speak_now');
                };

                this.recognition.onerror = function(event) {
                    if (event.error == 'no-speech') {
                      //start_img.src = '/intl/en/chrome/assets/common/images/content/mic.gif';
                      //showInfo('info_no_speech');
                      self.model.set('ignore_onend',true);
                    }
                    if (event.error == 'audio-capture') {
                      //start_img.src = '/intl/en/chrome/assets/common/images/content/mic.gif';
                      //showInfo('info_no_microphone');
                      self.model.set('ignore_onend',true);
                    }
                    if (event.error == 'not-allowed') {
                      if (event.timeStamp - start_timestamp < 100) {
                        //showInfo('info_blocked');
                      } else {
                        //showInfo('info_denied');
                      }
                      self.model.set('ignore_onend',true);
                    }
                };

                this.recognition.onend = function() {
                    self.model.set('recognizing',false);
                    //self.$('.transcript').css({ 'background-color': '' });
                    self.$('.title').css({ 'color': 'white' });

                    if (!self.model.get('final_transcript')) {
                      return;
                    }
                    //self.model.set('output',self.model.get('final_transcript'));

                };

                this.recognition.onresult = function(event) {
                    var interim_transcript = '';
                    if (typeof(event.results) == 'undefined') {
                      self.recognition.onend = null;
                      self.recognition.stop();
                      return;
                    }
                    for (var i = event.resultIndex; i < event.results.length; ++i) {
                      if (event.results[i].isFinal) {
                          self.$('.transcript').css({ 'background-color': 'lime' });
                          interim_transcript += event.results[i][0].transcript;
                          self.model.set('final_transcript',interim_transcript);
                          if (!self.model.get('continuous') && self.model.get('recognizing')) {
                              // stop recognition
                              self.recognition.stop();
                          } // else continue recognizing
                          self.model.set('output',self.model.get('final_transcript'));
                      } else {
                          self.model.set('output','');
                          self.$('.transcript').css({ 'background-color': 'yellow' });
                          interim_transcript += event.results[i][0].transcript;
                      }
                    }
                    //interim_transcript = capitalize(interim_transcript);
                    //self.model.set('speach-output',interim_transcript);
                    self.model.set('final_transcript',interim_transcript);
                };
            }

		},
        
        onModelChange: function(model) {
            if(model.changedAttributes().in1 !== undefined) {
                
                var input = parseFloat(this.model.get('in1'));  
                var threshold = this.model.get('threshold');
            
                if (this.model.get('lastIn') < threshold && input >= threshold) {
                    // start speach recognition
                    this.model.set('final_transcript','');
                    this.recognition.stop();
                    //this.recognition.lang = ['en-US', 'United States'];
                    this.recognition.lang = this.select_dialect.value;
                    this.recognition.start();
                    this.model.set('ignore_onend',false);
                    this.model.set('start_timestamp', Date.now());
                    this.$('.transcript').css({ 'background-color': 'yellow' });
                    this.$('.title').css({ 'color': 'red' });
                } else if (this.model.get('lastIn') >= threshold && input < threshold) {
                    if (this.model.get('recognizing')) {
                        this.recognition.stop();
                    }
                }
                
                this.model.set('lastIn',input);
                
                //this.model.set('output',result);
                
            }
        },
        
        outputText: function() {
            this.model.set('output',this.model.get('final_transcript'));
        },
        
        setLanguages: function() {
            
            this.langs =
                [['Afrikaans',       ['af-ZA']],
                 ['Bahasa Indonesia',['id-ID']],
                 ['Bahasa Melayu',   ['ms-MY']],
                 ['Català',          ['ca-ES']],
                 ['Čeština',         ['cs-CZ']],
                 ['Deutsch',         ['de-DE']],
                 ['English',         ['en-AU', 'Australia'],
                                     ['en-CA', 'Canada'],
                                     ['en-IN', 'India'],
                                     ['en-NZ', 'New Zealand'],
                                     ['en-ZA', 'South Africa'],
                                     ['en-GB', 'United Kingdom'],
                                     ['en-US', 'United States']],
                 ['Español',         ['es-AR', 'Argentina'],
                                     ['es-BO', 'Bolivia'],
                                     ['es-CL', 'Chile'],
                                     ['es-CO', 'Colombia'],
                                     ['es-CR', 'Costa Rica'],
                                     ['es-EC', 'Ecuador'],
                                     ['es-SV', 'El Salvador'],
                                     ['es-ES', 'España'],
                                     ['es-US', 'Estados Unidos'],
                                     ['es-GT', 'Guatemala'],
                                     ['es-HN', 'Honduras'],
                                     ['es-MX', 'México'],
                                     ['es-NI', 'Nicaragua'],
                                     ['es-PA', 'Panamá'],
                                     ['es-PY', 'Paraguay'],
                                     ['es-PE', 'Perú'],
                                     ['es-PR', 'Puerto Rico'],
                                     ['es-DO', 'República Dominicana'],
                                     ['es-UY', 'Uruguay'],
                                     ['es-VE', 'Venezuela']],
                 ['Euskara',         ['eu-ES']],
                 ['Français',        ['fr-FR']],
                 ['Galego',          ['gl-ES']],
                 ['Hrvatski',        ['hr_HR']],
                 ['IsiZulu',         ['zu-ZA']],
                 ['Íslenska',        ['is-IS']],
                 ['Italiano',        ['it-IT', 'Italia'],
                                     ['it-CH', 'Svizzera']],
                 ['Magyar',          ['hu-HU']],
                 ['Nederlands',      ['nl-NL']],
                 ['Norsk bokmål',    ['nb-NO']],
                 ['Polski',          ['pl-PL']],
                 ['Português',       ['pt-BR', 'Brasil'],
                                     ['pt-PT', 'Portugal']],
                 ['Română',          ['ro-RO']],
                 ['Slovenčina',      ['sk-SK']],
                 ['Suomi',           ['fi-FI']],
                 ['Svenska',         ['sv-SE']],
                 ['Türkçe',          ['tr-TR']],
                 ['български',       ['bg-BG']],
                 ['Pусский',         ['ru-RU']],
                 ['Српски',          ['sr-RS']],
                 ['한국어',            ['ko-KR']],
                 ['中文',             ['cmn-Hans-CN', '普通话 (中国大陆)'],
                                     ['cmn-Hans-HK', '普通话 (香港)'],
                                     ['cmn-Hant-TW', '中文 (台灣)'],
                                     ['yue-Hant-HK', '粵語 (香港)']],
                 ['日本語',           ['ja-JP']],
                 ['Lingua latīna',   ['la']]];
            
                for (var i = 0; i < this.langs.length; i++) {
                    this.select_language.options[i] = new Option(this.langs[i][0], i);
                }

                this.select_language.selectedIndex = this.model.get('language');
                this.updateCountry();
                //this.select_dialect.selectedIndex = 6;
                this.select_dialect.value = this.model.get('dialect');
            },
        
            updateCountry: function() {
                for (var i = this.select_dialect.options.length - 1; i >= 0; i--) {
                    this.select_dialect.remove(i);
                }
                var list = this.langs[this.select_language.selectedIndex];
                for (var i = 1; i < list.length; i++) {
                    this.select_dialect.options.add(new Option(list[i][1], list[i][0]));
                }
                this.select_dialect.style.visibility = list[1].length == 1 ? 'hidden' : 'visible';
            }

	});
});
