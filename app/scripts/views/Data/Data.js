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
			{title: 'in', to: 'in'},
		],
		outs: [
			// title is decorative, from: <widget model field>, to: <widget model field being listened to>
			{title: 'out', from: 'dataOut', to: 'out'},
		],
        // Any custom DOM events should go here (Backbone style)
        widgetEvents: {
           'click .dataIndex': 'triggerNxtElement',
           //'change #database': 'setOrder',
        },
		// typeID us the unique ID for this widget. It must be a unique name as these are global.
		typeID: 'Data',
		className: 'data',
		template: _.template(Template),

		initialize: function(options) {
			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);

            // Call any custom DOM events here
			this.model.set({
                title: 'Data',
                
                database: "one,two,three,four,five,six,seven,eight,nine,ten",
                orderType: "ordered",
                rangeMin: 512,
                rangeMax: 1023,
                segments: 1,
                delimiter: ',',
                dataOut: "one",
                out: "",
                dataIndex: "-- of 10",
                triggerNextElement: false,
                orderedDatabase: "1) one\n2) two\n3) three\n4) four\n5) five\n6) six\n7) seven\n8) eight\n9) nine\n10) ten\n",
            });

            this.elements = this.splitDatabase();
            this.elementIndexes = [];
            this.currentElement = 0;
            this.lastSegment = -1;
            this.lastOrderType = '';
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
            
            if(window.app.server) {
                this.splitDatabase();
                this.setOrder();
                this.model.set('dataOut', '');
            }
            
            this.$( '.dataIndex' ).css( 'cursor', 'pointer' );

            var self = this;

        },

        onModelChange: function(model) {
            if(window.app.server) {
                if(model.changedAttributes().in !== undefined) {
                    var input = parseFloat(this.model.get('in'),10);
                    var min = parseFloat(this.model.get('rangeMin'),10);
                    var max = parseFloat(this.model.get('rangeMax'),10) + 1;
                    var segments = parseInt(this.model.get('segments'),10);
                    var segmentSize = (max-min) / segments;
                    var segment = Math.floor((input - min)/segmentSize);
                    
                    if (segment >= 0 && segment < segments && segment != this.lastSegment) {
                        this.nextElement();
                    }
                    this.lastSegment = segment;
                }
                if(model.changedAttributes().orderType !== undefined) {
                    if (model.changedAttributes().orderType != this.lastOrderType) {
                        this.lastOrderType = model.changedAttributes().orderType;
                        this.setOrder();
                        this.model.set('dataIndex', "-- of " + this.elements.length);
                    }
                }
                if (model.changedAttributes().database !== undefined || 
                    model.changedAttributes().delimiter !== undefined) {
                    this.splitDatabase();
                    this.setOrder();
                    this.model.set('dataIndex', "-- of " + this.elements.length);
                }
                if (model.changedAttributes().triggerNextElement === true) {
                    this.model.set('triggerNextElement',false);
                    this.nextElement();
                }
            }
        },
        
        setOrder: function(e) {
            var mode = this.model.get('orderType');
            
            if (this.elements === undefined) {
                this.splitDatabase();
            }
            this.elementIndexes = [];
            for (var i = 0; i < this.elements.length; i++) {
                this.elementIndexes.push(i);
            }

            var arr = this.elementIndexes;

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

            this.currentElement = 0;
            
            // build output string to show the order in use
            var orderedData = '';
            for (var i = 0; i < this.elementIndexes.length; i++) {
                orderedData += (i+1) + ") " + this.elements[this.elementIndexes[i]] + "\n";
            }

            this.model.set('orderedDatabase',orderedData);

        },
        
        nextElement: function(e) {
            
            var elementIndex = this.elementIndexes[this.currentElement];
            var element = this.elements[elementIndex];
            this.model.set('dataOut', element);
            this.model.set('out', element);
            this.model.set('dataIndex', elementIndex + 1 + " of " + this.elements.length);

            this.currentElement++;
            if (this.currentElement >= this.elements.length) {
                this.setOrder();
                this.currentElement = 0;
            }
            this.model.set('triggerNextElement',false);
        },
        
        triggerNxtElement: function(e) {
            this.model.set('triggerNextElement',false);
            this.model.set('triggerNextElement',true);
        },
        
        splitDatabase: function(e) {
            var delimiter = this.model.get('delimiter');
            var str = this.model.get('database').replace(/(\r\n|\n|\r)/gm, "\n");
            if (this.model.get('delimiter') == '\\n') {
                delimiter = '\n';
            }
            this.elements = str.split(delimiter);
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
