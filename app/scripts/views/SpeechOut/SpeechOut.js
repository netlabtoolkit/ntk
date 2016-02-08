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
            {title: 'in2', to: 'in2'},
		],
		outs: [
			// title: decorative, from: <widget model field>, to: <widget model field being listened to>
			{title: 'out1', from: 'output', to: 'out1'},
		],
        
        widgetEvents: {
            'change .select_language': 'updateCountry',
            'change .voice': 'updateLang',
            'mousedown .speak': 'speakStart',
            'mouseup .speak': 'speakStop',
        },
		sources: [],
		typeID: 'SpeechOut',
		className: 'speechout',
        categories: ['generator'],
		template: _.template(Template),

		initialize: function(options) {

			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);
            
            // Call any custom DOM events here
            this.model.set({
                title: 'SpeechOut',
                in1: 0,
                in2: 'Hello world, this is a test',
                voice: 'Samantha',
                language: 6,
                dialect: 'en-US',
                lang: 'en-US',
                threshold: 512,
                autoPlay: true,
                autoCancel: false,
                lastIn: -1,
                start_timestamp: 0,
                continuous: false,
                domReady: false,
                
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
            
            if(!app.server) {
                this.$( '.speak' ).css( 'cursor', 'pointer' );
            
                // setup speach recognition
                if (!('speechSynthesis' in window)) {
                    alert("Browser not supported for speech synthesis");
                } else {
                    this.voiceSelect = this.$( '.voice' ).get(0);
                    this.select_language = this.$( '.select_language' ).get(0);
                    this.select_dialect = this.$( '.select_dialect' ).get(0);
                    this.voiceDialects = {};
                    //this.loadVoices();
                    this.setLanguages();
                    //this.voiceSelect.value = this.model.get('voice');
                    //this.updateLang();

                    this.msg = new SpeechSynthesisUtterance();
                    //this.voices = window.speechSynthesis.getVoices();
                    //msg.voice = voices[10]; // Note: some voices don't support altering params
                    //this.msg.voiceURI = 'native';
                    this.msg.volume = 1; // 0 to 1
                    this.msg.rate = 1; // 0.1 to 10
                    this.msg.lang = 'en-US';

                    window.speechSynthesis.onvoiceschanged = function(e) {
                        if (!self.voiceSelect.value) {
                            self.loadVoices();
                            self.voiceSelect.value = self.model.get('voice');
                            self.updateLang();
                        }
                    };
                    this.msg.onend = function(e) {
                      //console.log('Finished in ' + e.elapsedTime + ' seconds.');
                    };

                    //speechSynthesis.speak(msg);
                }
            }
            
            this.model.set('domReady',true); 

		},
        
        onModelChange: function(model) {

            if(!app.server && this.model.get('domReady')) {
                if (!this.voiceSelect.value) {
                    this.loadVoices();
                    this.voiceSelect.value = this.model.get('voice');
                    this.updateLang();
                }
                if(model.changedAttributes().in1 !== undefined) {

                    var input = parseFloat(this.model.get('in1'));  
                    var threshold = this.model.get('threshold');

                    if (this.model.get('lastIn') < threshold && input >= threshold) {
                        // start speach recognition
                        this.speak();
                    } else if (this.model.get('lastIn') >= threshold && input < threshold) {
                        if (this.model.get('autoCancel')) {
                            window.speechSynthesis.cancel();
                        }
                    }

                    this.model.set('lastIn',input); 
                }
                if(model.changedAttributes().in2 !== undefined) {
                    if (this.model.get('autoPlay')) {
                        this.speak();
                    }
                }
            }
        },
        
        speak: function() {
            var self = this;
            window.speechSynthesis.cancel();
            //this.msg.lang = 'en-US';
            this.msg.lang = this.select_dialect.value;
            this.msg.text = this.model.get('in2');
                
            if (this.voiceSelect.value) {
		      this.msg.voice = window.speechSynthesis.getVoices().filter(function(voice) { return voice.name == self.voiceSelect.value; })[0];
            }
            
            window.speechSynthesis.speak(this.msg);
        },
        
        loadVoices: function() {
            var self = this;
            // Fetch the available voices.
            var voices = window.speechSynthesis.getVoices();
            

            // Loop through each of the voices.
            voices.forEach(function(voice, i) {
                // Create a new option element.
                var option = document.createElement('option');

                // Set the options value and text.
                option.value = voice.name;
                option.innerHTML = voice.name;
                self.voiceDialects[voice.name] = voice.lang;
                //console.log(voice.name + ' ' + voice.lang)

                // Add the option to the voice selector.
                self.voiceSelect.appendChild(option);
            });
        },
        
        speakStart: function() {
            this.model.set('in1',1023);
        },
        
        speakStop: function() {
            this.model.set('in1',0);
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
            },
            
            updateLang: function() {
                //var voiceLang = this.voiceDialects[this.voiceSelect.selectedIndex];
                //this.$('.voiceLang').text(this.voiceDialects[this.model.get('voice')]);
                //console.log(this.model.get('voice'));
                this.model.set('lang', this.voiceDialects[this.model.get('voice')])
                //this.$('.voiceLang').text(this.voiceDialects[this.voiceSelect.value]);
            }

        

    });
});
