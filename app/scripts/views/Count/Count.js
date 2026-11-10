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

	// done stays at 1023 this long - long enough to see, like DigitalIn's.
	var DONE_MS = 200;

	return WidgetView.extend({
		// Map inputs to model
		ins: [
			// title: decorative, to: <widget model field>
			// A header port (plans/control-flow.md): rising past the
			// threshold counts one, like in1-in3 - so another widget's
			// done can step the count along.
			{title: 'start', to: 'start', header: true},
			{title: 'in1', to: 'in1'},
			{title: 'in2', to: 'in2'},
            {title: 'in3', to: 'in3'},
			// in4 resets: back to nothing counted, so the next count lands
			// on min (max counting down). Still the in4 field, so saved
			// cables keep their place.
			{title: 'reset', to: 'in4'},
		],
		outs: [
			// title: decorative, from: <widget model field>, to: <widget model field being listened to>
			{title: 'out1', from: 'output', to: 'out1'},
			// A header port (plans/control-flow.md): pulses 1023 for
			// DONE_MS when a count arrives at max (at min, counting down
			// with a negative increment) - "after three presses, start
			// the scene". With min 1 and max 3 it fires every third count.
			{title: 'done', from: 'done', to: 'done', header: true, noChain: true},
		],
		sources: [],
		typeID: 'Count',
		className: 'count',
        categories: ['logic'],
		template: _.template(Template),

		initialize: function(options) {

			// Call the superclass constructor
			WidgetView.prototype.initialize.call(this, options);
            
            // Call any custom DOM events here
            this.model.set({
                title: 'Count',
                in1: '-',
				in2: '-',
                in3: '-',
				in4: '-',
				output: 0,
                outputFloor: 0,
                outputCeiling: 10,
                threshold: 512,
                increment: 1,
                lastIns: [-1,-1,-1,-1],
                done: 0,
                start: 0,
            });
            this.doneTimer = null;
            this.lastStart = 0;

            

		},
        /**
         * called when widget is rendered
         *
         * @return
         */
		onRender: function() {
			WidgetView.prototype.onRender.call(this);

            var self = this;

		},
        
        onModelChange: function(model, options) {
            // start rising past the threshold counts one. Only a value
            // arriving through a cable (updateNoTrigger), not one a patch
            // loads; lastStart set first, as Backbone runs this again
            // with the same changes after the set in countBy (CLAUDE.md).
            if (model.changedAttributes().start !== undefined && options && options.updateNoTrigger) {
                var start = parseFloat(this.model.get('start')),
                    startThreshold = parseFloat(this.model.get('threshold'));
                if (isNaN(startThreshold)) { startThreshold = 512; }
                var rose = !(this.lastStart >= startThreshold) && start >= startThreshold;
                this.lastStart = start;
                if (rose) { this.countBy(1); }
            }

            if((model.changedAttributes().in1 !== undefined && model.changedAttributes().in1 != this.model.get('lastIns')[0]) ||
               (model.changedAttributes().in2 !== undefined && model.changedAttributes().in2 != this.model.get('lastIns')[1]) ||
               (model.changedAttributes().in3 !== undefined && model.changedAttributes().in3 != this.model.get('lastIns')[2]) ||
               (model.changedAttributes().in4 !== undefined && model.changedAttributes().in4 != this.model.get('lastIns')[3])) {
                
                var ins = [parseFloat(this.model.get('in1')),
                           parseFloat(this.model.get('in2')),
                           parseFloat(this.model.get('in3')),
                           parseFloat(this.model.get('in4'))];
                
                /*for (var i=(ins.length - 1);i>=0;i--) {
                    if (isNaN(ins[i])) ins.splice(i, 1);
                    
                }*/
                
                var increaseBy = 0;
                var threshold = this.model.get('threshold');
                
                //console.log(this.model.get('lastIns')[0]);
                
                // A last value that isn't a number (an unwired inlet's
                // '-') counts as below the threshold: the first press
                // after adding a Count used to be lost.
                if (model.changedAttributes().in1 !== undefined) {
                    if (!(this.model.get('lastIns')[0] >= threshold) && ins[0] >= threshold) increaseBy++;
                    this.model.get('lastIns')[0] = ins[0];
                }
                if (model.changedAttributes().in2 !== undefined) {
                    if (!(this.model.get('lastIns')[1] >= threshold) && ins[1] >= threshold) increaseBy++;
                    this.model.get('lastIns')[1] = ins[1];
                }
                if (model.changedAttributes().in3 !== undefined) {
                    if (!(this.model.get('lastIns')[2] >= threshold) && ins[2] >= threshold) increaseBy++;
                    this.model.get('lastIns')[2] = ins[2];
                }
                var reset = false;
                if (model.changedAttributes().in4 !== undefined) {
                    if (!(this.model.get('lastIns')[3] >= threshold) && ins[3] >= threshold) reset = true;
                    this.model.get('lastIns')[3] = ins[3];
                }
                // A reset arriving with counts: the reset first, then they count.
                if (reset) { this.resetCount(); }

                // Only a count moves the value - a release, or a change
                // that doesn't cross the threshold, used to wrap a value
                // below min round to max.
                if (increaseBy !== 0) { this.countBy(increaseBy); }
            }
        },

        /**
         * countBy - add `counts` increments, wrapping past max to min
         * (below min to max); done pulses when the count lands on the
         * end it's heading for.
         *
         * @param {number} counts how many rises were seen
         * @return {void}
         */
        countBy: function(counts) {
            var step = counts * this.model.get('increment');
            var result = parseFloat(this.model.get('output')) + step;
            // Numbers, not the fields' text: done compares with them.
            if (result > this.model.get('outputCeiling')) result = parseFloat(this.model.get('outputFloor'));
            else if (result < this.model.get('outputFloor')) result = parseFloat(this.model.get('outputCeiling'));

            this.model.set('output',result);

            var target = parseFloat(step > 0 ? this.model.get('outputCeiling') : this.model.get('outputFloor'));
            if (result === target) { this.pulseDone(); }
        },

        /**
         * resetCount - what in4 (reset) does: back to nothing counted,
         * one increment short of min (past max, counting down), so the
         * next count lands on it.
         *
         * @return {void}
         */
        resetCount: function() {
            var increment = parseFloat(this.model.get('increment'));
            if (isNaN(increment) || increment === 0) { increment = 1; }
            var from = parseFloat(increment > 0 ? this.model.get('outputFloor') : this.model.get('outputCeiling'));
            if (isNaN(from)) { from = 0; }
            this.model.set('output', from - increment);
        },

        /**
         * setFromModel - a patch saved mid-pulse stores done at 1023,
         * with no timer left to bring it back down, so done always loads
         * as 0.
         *
         * @param {object} model
         * @return {WidgetView} this view
         */
        setFromModel: function(model) {
            var result = WidgetView.prototype.setFromModel.call(this, model);
            this.model.set('done', 0);
            return result;
        },

        /**
         * pulseDone - done goes to 1023 and back to 0 after DONE_MS.
         *
         * @return {void}
         */
        pulseDone: function() {
            var self = this;
            clearTimeout(this.doneTimer);
            this.model.set('done', 1023);
            this.doneTimer = setTimeout(function() { self.model.set('done', 0); }, DONE_MS);
        },

        onRemove: function() {
            clearTimeout(this.doneTimer);
        },

	});
});
