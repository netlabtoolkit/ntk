define([
	'backbone',
	'rivets',
	'views/item/WidgetMulti',
	'text!./template.js',
	'utils/miniMarkdown',
],
function(Backbone, rivets, WidgetView, Template, miniMarkdown){
    'use strict';

	return WidgetView.extend({
		typeID: 'Text',
        categories: ['media'],
		className: 'text',
		template: _.template(Template),
		sources: [],
        widgetEvents: {
            // .detachedEl is re-parented out of this.$el in onRender, so
            // its mouseup is bound directly there, not delegated here.
            'change .displayWidth': 'updateDisplay',
            'change .displayHeight': 'updateDisplay',
            'change .displayFontFamily': 'updateDisplay',
            'change .displayFontSize': 'updateDisplay',
            'change .displayFontColor': 'updateDisplay',
            'change .displayFontItalic': 'updateDisplay',
            'change .displayFontBold': 'updateDisplay',
            'click .importText': 'importText',
            'click .exportText': 'exportText',
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
				// Pass-through: whatever arrives on the 'in' inlet (or is
				// typed into the text box) is also emitted from the outlet,
				// so a Text widget can sit inline in a chain of
				// text-consuming widgets without being a dead end.
				// WidgetMulti's processSignalChain (bound to model 'change')
				// copies `from` -> `to` automatically.
				outs: [
					{title: 'out', from: 'in', to: 'out1'},
				],
				title: 'Text',

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
                top: 320,
				opacity: 100,
                displayWidth: 260,
                displayHeight: 110,
                displayFont: "Arial, Helvetica, sans-serif",
                displayFontSize: "18px",
                displayFontColor: "#000000",
                displayFontItalic: false,
                displayFontBold: false,
                displayClass: 'displaytext',
                displayClassLast: 'displaytext',
                renderMarkdown: true,
                in: "Populus uxor antehabeo validus turpis dignissim verto si consequat quadrum.",


			});


            this.domReady = false;
            this.lastIn = -1;
            

		},

        onRender: function() {
			WidgetView.prototype.onRender.call(this);
            var self = this;
            if(!app.server) {
                var $box = this.$( '.detachedEl' );

                // The box is a passive display floating over the canvas.
                // Its body is pointer-events:none (never blocks a widget),
                // but its drag bar / resize handles must stay grabbable
                // even where it overlaps a widget - which means it can't
                // live inside the widget's own stacking context. Re-parent
                // it to the shared widget layer and float it above the
                // widgets (toolbar is z-index 100, so 30 is clear).
                this.$box = $box;
                var $layer = this.$el.closest('.widgets');
                if($layer.length) { $box.appendTo($layer); }
                // Concrete box size before jQuery UI initialises, so the
                // se handle has a real height to grow from (not "auto").
                $box.css({
                    position: 'fixed',
                    zIndex: 30,
                    width: (parseInt(this.model.get('displayWidth'), 10) || 260) + 'px',
                    height: (parseInt(this.model.get('displayHeight'), 10) || 110) + 'px',
                    overflow: 'hidden',  // inner .displayScroll scrolls, not the box
                });
                $box.draggable({ handle: '.detachedDrag', cancel: '.ui-resizable-handle' });
                $box.resizable({
                    handles: 'se, s, e',
                    minWidth: 80,
                    minHeight: 30,
                    stop: function(e, ui) {
                        self.model.set('displayWidth', Math.round(ui.size.width));
                        self.model.set('displayHeight', Math.round(ui.size.height));
                    },
                });
                // .detachedEl is no longer inside this.$el, so the
                // delegated 'mouseup .detachedEl' widgetEvent can't reach
                // it - bind the position save directly.
                $box.on('mouseup', function(e) { self.imgMoved(e); });

                this.textDiv = $box.find('.displaytext');
                this.$scroll = $box.find('.displayScroll');
                this.domReady = true;
                this.updateDisplay();
                this.renderDisplay();
                this.updateStats();

                // pointer-events:none also disables native wheel scrolling
                // on the box - re-add it manually: scroll .displayScroll
                // when the pointer is within its bounds, without ever
                // consuming a click.
                this._onWheel = function(e) {
                    var el = self.$scroll && self.$scroll.get(0);
                    if(!el || el.scrollHeight <= el.clientHeight) { return; }
                    var r = el.getBoundingClientRect();
                    if(e.clientX < r.left || e.clientX > r.right ||
                       e.clientY < r.top || e.clientY > r.bottom) { return; }
                    el.scrollTop += e.deltaY;
                    e.preventDefault();
                };
                document.addEventListener('wheel', this._onWheel, { passive: false });
            }
		},

        onRemove: function() {
            if(this._onWheel) { document.removeEventListener('wheel', this._onWheel, { passive: false }); }
            // The box lives outside this.$el now, so this.remove() won't
            // take it - clear it explicitly.
            if(this.$box) { this.$box.remove(); }
        },

        onModelChange: function(model) {
            if(!app.server) {
                var changed = model.changedAttributes() || {};
                if (changed.in !== undefined && changed.in != this.lastIn) {
                    if (this.model.get('appendText')) {
                        this.model.set('displayText',this.model.get('displayText') + " " + this.model.get('in'));
                    } else {
                        this.model.set('displayText',this.model.get('in'));
                    }
                }
                this.lastIn = changed.in;
                if (changed.displayClass !== undefined && this.domReady) {
                    var lastClass = this.model.get('displayClassLast');
                    var newClass = this.model.get('displayClass');
                    this.textDiv.removeClass(lastClass).addClass(newClass);
                    this.model.set('displayClassLast',newClass)
                }
                if ((changed.displayText !== undefined || changed.renderMarkdown !== undefined) && this.domReady) {
                    this.renderDisplay();
                }
                if (changed.displayText !== undefined && this.domReady) {
                    this.updateStats();
                }
            }
        },

        // Word count + the 5 most frequent words (case-insensitive,
        // punctuation stripped, common function words and 1-2 letter
        // words skipped so the list is actually informative).
        updateStats: function() {
            if(app.server) { return; }
            var STOP = ' the a an and or but if then else of to in on at by for with from as is are was were be been being it its this that these those i you he she we they them his her our your their not no do does did have has had will would can could should there here what which who whom ';
            var text = String(this.model.get('displayText') != null ? this.model.get('displayText') : '');
            var tokens = text.toLowerCase().replace(/[^a-z0-9'\s-]/g, ' ').split(/\s+/);
            var words = 0, counts = {};
            for(var i = 0; i < tokens.length; i++) {
                var w = tokens[i].replace(/^['-]+|['-]+$/g, '');
                if(!w) { continue; }
                words++;
                if(w.length < 3 || STOP.indexOf(' ' + w + ' ') !== -1) { continue; }
                counts[w] = (counts[w] || 0) + 1;
            }
            var top = _.first(_.sortBy(_.keys(counts), function(k) { return -counts[k]; }), 5);
            this.$('.wordCount').text(words + (words === 1 ? ' word' : ' words'));
            this.$('.topWords').text(top.length
                ? 'top: ' + _.map(top, function(k) { return k + ' (' + counts[k] + ')'; }).join(', ')
                : '');
        },

        // Render displayText into the display box - as Markdown when the
        // "Render markdown" option is on, else as plain text. miniMarkdown
        // HTML-escapes its input, so no markup from an inlet / file / LLM
        // can execute.
        renderDisplay: function() {
            if(app.server || !this.textDiv) { return; }
            var text = String(this.model.get('displayText') != null ? this.model.get('displayText') : '');
            if (this.model.get('renderMarkdown')) {
                this.textDiv.html(miniMarkdown(text));
            } else {
                this.textDiv.text(text);
            }
            // Fresh child elements were just created - re-apply the font.
            this.applyFontStyles();
        },

        updateDisplay: function(e) {
            if(app.server || !this.$box) { return; }
            this.$box.css( 'width', parseInt(this.model.get('displayWidth'), 10) || 260 );
            this.$box.css( 'height', parseInt(this.model.get('displayHeight'), 10) || 110 );
            this.applyFontStyles();
        },

        // Font family / size / weight / style / colour for the display box.
        // Set on the .displaytext container AND pushed onto the
        // markdown-rendered children: the global `* { font-family }` rule
        // in global.scss (and the browser's own bold on <h1>-<h6>) beat
        // plain inheritance, so the children need it applied directly.
        // <code>/<pre> stay monospace; <strong>/<b>/<em>/<i> keep their
        // emphasis; headings keep their relative (em-based) size.
        applyFontStyles: function() {
            if(app.server || !this.textDiv) { return; }
            var m = this.model;
            var family = m.get('displayFont');
            var size = m.get('displayFontSize');
            var style = m.get('displayFontItalic') ? 'italic' : 'normal';
            var weight = m.get('displayFontBold') ? 'bold' : 'normal';
            var color = m.get('displayFontColor');

            this.textDiv.css({
                'font-family': family,
                'font-size': size,
                'font-style': style,
                'font-weight': weight,
                'color': color,
            });

            var kids = this.textDiv.find('*').not('code, pre, code *, pre *');
            kids.css({ 'font-family': family, 'color': color });
            kids.not('strong, b, h1, h2, h3, h4, h5, h6').css('font-weight', weight);
            kids.not('em, i').css('font-style', style);
        },
        
        imgMoved: function(e) {
            var $box = this.$box || this.$('.detachedEl');
            // The box is position:fixed, so use the raw css left/top (what
            // draggable actually set, and what the rv-positionx/y binders
            // write back). .offset() adds page scroll and would make the
            // box drift down on every move.
            var left = parseInt($box.css('left'), 10) || 0;
            var top = parseInt($box.css('top'), 10) || 0;
            // Never let it leave the viewport - keep a strip reachable.
            var maxLeft = (window.innerWidth || 1200) - 60;
            var maxTop = (window.innerHeight || 800) - 40;
            left = Math.max(0, Math.min(left, maxLeft));
            top = Math.max(0, Math.min(top, maxTop));
            $box.css({ left: left + 'px', top: top + 'px' });
            this.model.set('left', left);
            this.model.set('top', top);
        },

        importText: function() {
            if(app.server || !window.ntkElectron || !window.ntkElectron.readTextFile) { return; }
            var self = this;
            window.ntkElectron.readTextFile().then(function(res) {
                if(!res || res.error || res.text == null) {
                    if(res && res.error) { self.$('.fileStatus').text('import failed: ' + res.error); }
                    return;
                }
                self.model.set('in', res.text);
                self.model.set('displayText', res.text);
                self.$('.fileStatus').text('imported ' + res.name);
            });
        },

        exportText: function() {
            if(app.server || !window.ntkElectron || !window.ntkElectron.writeTextFile) { return; }
            var self = this;
            window.ntkElectron.writeTextFile({
                text: String(this.model.get('in') || ''),
                defaultName: 'text.md',
            }).then(function(res) {
                if(!res || res.canceled) { return; }
                if(res.error) { self.$('.fileStatus').text('export failed: ' + res.error); return; }
                self.$('.fileStatus').text('saved ' + (res.path ? res.path.split('/').pop() : ''));
            });
        },

	});
});


