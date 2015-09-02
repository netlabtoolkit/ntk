define([
	'backbone',
    'rivets',
	'views/item/WidgetMulti',
	'text!./template.js',

	// If you would like signal processing classes and functions include them here
	'utils/SignalChainFunctions',
	'utils/SignalChainClasses',
	// and any other imported libraries you like should go here
    'jqueryknob',
],
function(Backbone, rivets, WidgetView, Template, SignalChainFunctions, SignalChainClasses, jqueryknob){
    'use strict';

	return WidgetView.extend({
		// Define the inlets
		ins: [
			// title is decorative, to: <widget model field being set by inlet>
			{title: 'in', to: 'inTrigger'},
            {title: 'index', to: 'inIndex'},
		],
		outs: [
			// title is decorative, from: <widget model field>, to: <widget model field being listened to>
			{title: 'out', from: 'dataOut', to: 'out'},
		],
        // Any custom DOM events should go here (Backbone style)
        widgetEvents: {
            'click .dataIndex': 'nextElement',
            'change .orderType': 'setOrder',
            'change .database': 'resetData',
            'change .dataTypeNum': 'resetData',
            'change .dataTypeText': 'resetData',
            'change .numericMax': 'resetData',
            'change .numericMin': 'resetData',
            'change .delimiter': 'resetData',
        },
		// typeID us the unique ID for this widget. It must be a unique name as these are global.
		typeID: 'Data',
		className: 'data',
        categories: ['data-feed'],
		template: _.template(Template),

		initialize: function(options) {
			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);

            // Call any custom DOM events here
			this.model.set({
                title: 'Data',
                inTrigger: 0,
                inIndex: 0,
                database: "apple,banana,cherry,date,elderberry,fig,grape,huckleberry",
                orderType: "ordered",
                rangeMin: 512,
                rangeMax: 1023,
                segments: 1,
                lastSegment: -1,
                dataType: 'text',
                delimiter: ',',
                dataOut: "",
                out: "",
                dataIndex: "",
                numericMin: 0,
                numericMax: 1023,
                orderedDatabase: "",
                elements: [],
                elementIndexes: [],
                currentElement: 0,
            });

            this.widgetReady = false;
            // If you want to register your own signal processing function, push them to signalChainFunctions
			//this.signalChainFunctions.push(this.outputText);

			// Likewise, if you need to register an instance-based processor
			//this.smoother = new SignalChainClasses.Smoother({tolerance: 50});
			//this.signalChainFunctions.push(this.smoother.getChainFunction());

			// If you would like to register any function to be called at frame rate (60fps)
			//window.app.timingController.registerFrameCallback(this.processSignalChain, this);
		},

        /**
         * Called when widget is rendered
		 * Most of your custom binding and functionality will happen here
         *
         * @return {void}
         */
        onRender: function() {
			// always call the superclass
            WidgetView.prototype.onRender.call(this);
            
            this.$( '.dataIndex' ).css( 'cursor', 'pointer' );
            
            this.widgetReady = true;
            
            this.model.set('dataOut', '');
            this.buildDatabase();
            this.setOrder();
            
            var self = this;

        },

        onModelChange: function(model) {
            if (this.widgetReady) {
                if(model.changedAttributes().inTrigger !== undefined) {
                    var input = parseFloat(this.model.get('inTrigger'),10);
                    var min = parseFloat(this.model.get('rangeMin'),10);
                    var max = parseFloat(this.model.get('rangeMax'),10) + 1;
                    var segments = parseInt(this.model.get('segments'),10);
                    var segmentSize = (max-min) / segments;
                    var segment = Math.floor((input - min)/segmentSize);

                    if (segment >= 0 && segment < segments && segment != this.model.get('lastSegment')) {
                        this.nextElement();
                    }
                    this.model.set('lastSegment',segment);
                }
                
                if(model.changedAttributes().inIndex !== undefined) {
                    this.indexElement(parseInt(this.model.get('inIndex'),10));
                }
                                      
            }
        },
        
        resetData: function() {
            this.buildDatabase();
            this.setOrder(true);
        },
        
        setOrder: function(resetDisplay) {
            if (this.widgetReady) {
                resetDisplay = typeof resetDisplay !== 'undefined' ? resetDisplay : true;

                var mode = this.model.get('orderType');
                /*
                if (this.model.get('elements') === undefined) {
                    this.buildDatabase();
                }*/
                this.model.set('elementIndexes',[]);
                for (var i = 0; i < this.model.get('elements').length; i++) {
                    this.model.get('elementIndexes').push(i);
                }

                var arr = this.model.get('elementIndexes');

                switch(mode) {
                    case 'ordered':
                        // do nothing
                        break;
                    case 'reverse':
                        arr.reverse();
                        break;
                    case 'randomFull':
                        this.shuffle(arr);
                        break;
                    case 'randomNoRepeat':
                        this.randomize(arr,true);
                        break;
                    case 'randomAny':
                        this.randomize(arr,false);
                        break;
                    default:
                        //
                }

                this.model.set('currentElement', 0);

                // build output string to show the order in use
                
                var orderedData = '';
                for (var i = 0; i < this.model.get('elementIndexes').length; i++) {
                    orderedData += (i) + ") " + this.model.get('elements')[this.model.get('elementIndexes')[i]] + "\n";
                }

                //this.model.set('orderedDatabase',orderedData,{silent : true});
                this.model.set('orderedDatabase',orderedData);
                if (resetDisplay) this.model.set('dataIndex', "-- of " + (this.model.get('elements').length - 1));
            }
        },
        
        indexElement: function(index) {
            if (index >= 0 && index < this.model.get('elementIndexes').length) {
                var elementIndex = this.model.get('elementIndexes')[index];
                var element = this.model.get('elements')[elementIndex];
                this.model.set('dataOut', element);
                this.model.set('dataIndex', elementIndex + " of " + (this.model.get('elements').length - 1));
            }
        },
        
        nextElement: function(e) {
            
            var elementIndex = this.model.get('elementIndexes')[this.model.get('currentElement')];
            var element = this.model.get('elements')[elementIndex];
            this.model.set('dataOut', element);
            this.model.set('dataIndex', elementIndex + " of " + (this.model.get('elements').length - 1));

            this.model.set('currentElement',this.model.get('currentElement') + 1);
            if (this.model.get('currentElement') >= this.model.get('elements').length) {
                this.setOrder(false);
                this.model.set('currentElement',0);
            }
        },
        
        buildDatabase: function(e) {
            if (this.widgetReady) {
                if (this.model.get('dataType') == 'text') {
                    var delimiter = this.model.get('delimiter');
                    var str = this.model.get('database');
                    str = str.replace(/(\r\n|\n|\r)/gm, "\n");
                    //var str = "one,two,three,four,five,six,seven,eight,nine,ten," + Math.random();
                    //var str = "one,two,three,four,five,six,seven,eight,nine,ten,wer".replace(/(\r\n|\n|\r)/gm, "\n");
                    if (this.model.get('delimiter') == '\\n') {
                        delimiter = '\n';
                    }
                    this.model.set('elements',str.split(delimiter));
                } else if (this.model.get('dataType') == 'number') {
                    this.model.set('elements',[]);
                    for (var i=parseInt(this.model.get('numericMin'),10);i<=parseInt(this.model.get('numericMax'),10);i++) {
                        this.model.get('elements').push(i);
                    }
                }
            }
        },
        
        shuffle: function (arr) {
            for (var i = arr.length - 1; i > 0; i--) {
                var randomIndex = Math.floor(Math.random() * (i + 1));
                var itemAtIndex = arr[randomIndex];
                arr[randomIndex] = arr[i];
                arr[i] = itemAtIndex;
                
                // add code to check that new arr[0] is different from arr[n] so we don't get a repeat
            }
            return arr;
        },
                    
        randomize: function (arr, noRepeat) {
            var newArr = arr.slice();
            var len = arr.length;
            
            arr[0] = newArr[Math.floor(Math.random() * (len))];
            for (var i=1;i<len;i++) {
                if (noRepeat) {
                    // add code to check that new arr[0] is different from arr[n] so we don't get a repeat
                    do {
                        arr[i] = newArr[Math.floor(Math.random() * (len))];
                    } while (arr[i] == arr[i-1]);
                } else {
                    arr[i] = newArr[Math.floor(Math.random() * (len))];
                }
            }
            
            return arr;
            
        },
	});
});
