/**
 * MonitorController - "monitor mode": watch a running standalone
 * patch's live values without taking over from it (see
 * plans/standalone-patch-export.md and the firmware-monitor-mode
 * branch history for the full design).
 *
 * Scoped per-widget as of 2026-09-23 (was blanket/global before that -
 * see git history): window.app.monitoring.wids tracks specifically
 * which widget ids have actually received a pushed monitor value
 * (populated lazily in onMonitorValue as they arrive). Each widget's
 * own signal-chain code (see WidgetMulti.js's processSignalChain)
 * checks its OWN wid against that set to decide whether to compute its
 * value locally or just display whatever's been pushed in - so you CAN
 * now monitor one device while separately, locally controlling a
 * widget that isn't part of that device's patch (e.g. a live OSCOut
 * sender used to test a monitored device's OSCIn). Found via hands-on
 * testing that the original blanket flag silently froze every widget
 * on canvas, not just the monitored ones.
 *
 * This does NOT load a patch for you by itself - you need the same
 * patch (matching wids) loaded in NTK's own canvas before starting
 * monitor mode. Use Pull from Device to fetch the exact patch a
 * device is running (see plans/standalone-patch-export.md's "Push/Pull
 * standalone patch" section), or the normal Load Patch action on the
 * standalone_patch.json it was exported from - a currently-loaded
 * patch that doesn't match won't error, it'll just silently show no
 * values for any wid NTK doesn't recognize.
 */
define([
	'application',
], function(app) {
	'use strict';

	var MonitorController = {
		active: false,
		host: null,
		port: null,

		initialize: function initialize() {
			window.app.monitoring = {active: false};

			window.app.vent.on('monitorValue', this.onMonitorValue, this);
			window.app.vent.on('monitorStatus', this.onMonitorStatus, this);
			window.app.vent.on('Monitor:start', this.start, this);
			window.app.vent.on('Monitor:stop', this.stop, this);
			window.app.vent.on('Monitor:blockedEdit', this.blockAndWarn, this);
		},

		start: function start(options) {
			this.host = options.host;
			this.port = options.port;
			this.active = true;
			// wids: which specific widgets have actually received a
			// pushed monitor value (populated lazily in onMonitorValue
			// as they arrive, not known up front - v1 has no "pull the
			// patch first" step that would give us the full set at
			// start()). WidgetMulti.js's processSignalChain checks this
			// per-widget instead of the old blanket "any monitoring
			// session running anywhere" check, added 2026-09-23 after
			// hands-on testing found it silently froze an unrelated,
			// separately-added live widget (e.g. a live OSCOut sender)
			// that has nothing to do with the monitored device - the
			// gap this module's own docstring already called out as
			// deliberately deferred, not an oversight.
			window.app.monitoring = {active: true, host: this.host, port: this.port, wids: {}};
			// Drives the "more" panel's click-blocking overlay (see
			// Widget.scss's body.ntk-monitoring rules and WidgetMulti.js's
			// onRender) - CSS-only, not per-widget JS toggling, so it can't
			// drift out of sync with the actual monitoring state.
			$('body').addClass('ntk-monitoring');
			this.showBanner('Connecting to ' + this.host + ':' + this.port + '...');
			window.app.vent.trigger('startMonitor', {host: this.host, port: this.port});
		},

		stop: function stop() {
			var host = this.host,
				port = this.port;

			this.active = false;
			window.app.monitoring = {active: false};
			$('body').removeClass('ntk-monitoring');
			window.app.vent.trigger('stopMonitor');
			this.hideBanner();

			// Starting monitoring closes NTK's own normal hardware
			// connection to this device to free it up for the monitor
			// connection (see nlMultiClientSync.js's client:startMonitor
			// handler) - nothing re-establishes it once monitoring
			// stops, so every widget on that device just sits idle with
			// no live connection until something else happens to nudge
			// it. Every hardware widget type (AnalogIn/AnalogOut/
			// DigitalIn/DigitalOut/Servo) already has its own
			// onModelChange -> inactiveModelsExist() -> enableDevice()
			// reconnect-if-needed check; a bare model 'change' trigger
			// (no field actually changes) is enough to make each one
			// re-run that check and reconnect if it's still active -
			// found via hands-on testing 2026-09-22 ("NTK is not
			// controlling things" after switching off monitoring).
			//
			// inactiveModelsExist() reads a CLIENT-side flag
			// (Patcher.Controller.hardwareModelInstances[key].model.active)
			// that has nothing to do with the server-side connection
			// closed above - it never got told that connection is gone,
			// so a bare 'change' trigger alone found the widget's own
			// value display resyncing fine (syncWithSource runs
			// unconditionally in onModelChange) but never actually
			// re-driving hardware (gated behind this same flag reading
			// stale true) - hands-on testing 2026-09-22 again, a second,
			// more specific report after the first partial fix.
			var hardwareKey = 'network:' + host + ':' + port;
			var hardwareModelInstance = window.app.Patcher.Controller.hardwareModelInstances[hardwareKey];
			if (hardwareModelInstance && hardwareModelInstance.model) {
				hardwareModelInstance.model.active = false;
			}

			_.each(window.app.Patcher.Controller.widgets, function(widgetView) {
				var deviceType = widgetView.model.get('deviceType'),
					server = widgetView.model.get('server'),
					widgetPort = widgetView.model.get('port');
				if (deviceType === 'network' && server === host && String(widgetPort) === String(port)) {
					// Match Backbone's own internal 'change' trigger shape
					// (model.trigger('change', model, options)) - a bare
					// trigger('change') with no arguments left every
					// widget type's own onModelChange(model) receiving
					// model===undefined, throwing immediately on
					// model.changedAttributes() before ever reaching the
					// reconnect branch that actually calls mapToModel/
					// enableDevice() - root-caused via a real uncaught
					// TypeError from hands-on testing 2026-09-22.
					widgetView.model.trigger('change', widgetView.model, {});
				}
			});
		},

		// Shared "you can't do that right now" feedback for every place
		// that blocks a structural patch edit (add/remove widget, wire/
		// unwire a cable) or a "more" panel field edit while monitoring -
		// see the module docstring's all-or-nothing design and the
		// session that scoped this: simulating a value via a widget's own
		// primary control (a knob drag, a button) is deliberately NOT
		// blocked here, only edits that would desync NTK's patch from the
		// device's or that are silently inert while monitoring (a "more"
		// panel tuning field the suppressed signal chain never reads).
		blockAndWarn: function blockAndWarn(e) {
			if (e && e.preventDefault) {
				e.preventDefault();
				e.stopPropagation();
			}
			this.showBlockedMessage(e);
			this.blinkBanner();
		},

		showBlockedMessage: function showBlockedMessage(e) {
			var pageX = (e && (e.pageX || (e.originalEvent && e.originalEvent.pageX))) || ($(window).width() / 2),
				pageY = (e && (e.pageY || (e.originalEvent && e.originalEvent.pageY))) || 80;

			var $msg = $('<div class="monitorBlockedMessage">NTK is in monitor mode - patch changes are not allowed</div>').appendTo('body').css({
				position: 'fixed',
				top: pageY - 30,
				left: pageX - 90,
				zIndex: 1001,
				background: '#b35c00',
				color: '#fff',
				padding: '6px 12px',
				borderRadius: '3px',
				fontFamily: 'sans-serif',
				fontSize: '12px',
				pointerEvents: 'none',
				opacity: 0,
			});
			$msg.animate({opacity: 1}, 150, function() {
				setTimeout(function() {
					$msg.animate({opacity: 0}, 400, function() { $msg.remove(); });
				}, 900);
			});
		},

		blinkBanner: function blinkBanner() {
			var $banner = $('#monitorModeBanner');
			if ($banner.length === 0) {
				return;
			}
			$banner.stop(true, true)
				.fadeTo(100, 0.25).fadeTo(100, 1)
				.fadeTo(100, 0.25).fadeTo(100, 1)
				.fadeTo(100, 0.25).fadeTo(100, 1)
				.fadeTo(100, 0.25).fadeTo(100, 1);
		},

		onMonitorStatus: function onMonitorStatus(status) {
			if (!this.active) {
				// A stopMonitor already fired (user clicked Stop) - ignore
				// a status update that was already in flight from the
				// server when that happened, so it can't reopen the
				// banner after the user just closed it.
				return;
			}
			if (status.connected) {
				this.showBanner('NTK is in remote monitoring mode - watching ' + this.host + ':' + this.port + ' (read only)');
			} else if (status.error) {
				this.showBanner('Monitor connection failed: ' + status.error);
			} else {
				this.showBanner('Monitor connection to ' + this.host + ':' + this.port + ' closed');
			}
		},

		// Routes one widget's pushed field values into its live model.
		// updateNoTrigger: true (see Patcher.js's bindModelToServer) is
		// essential here - without it, applying a pushed value would
		// itself broadcast right back out as a widgetUpdate, as if the
		// user had just edited that widget, which would echo to the
		// server and every other connected client for a value that
		// isn't actually a local change at all.
		onMonitorValue: function onMonitorValue(update) {
			if (!this.active) {
				return;
			}
			// Mark this wid as actually monitored - see start()'s comment.
			// Every push re-marks it, harmless (plain object used as a set).
			window.app.monitoring.wids[update.wid] = true;
			var widgetView = _.find(window.app.Patcher.Controller.widgets, function(view) {
				return view.model.get('wid') === update.wid;
			});
			if (!widgetView) {
				return; // no local widget with this wid - see the module docstring's v1 limitation
			}
			widgetView.model.set(update.fields, {updateNoTrigger: true});
		},

		// Inline styles, not Widget.scss - CLAUDE.md notes that's the
		// only stylesheet actually built, and this banner is a one-off
		// page-level element, not a widget - not worth a build-system
		// change for a handful of rules.
		showBanner: function showBanner(text) {
			var $banner = $('#monitorModeBanner');
			if ($banner.length === 0) {
				$banner = $('<div id="monitorModeBanner"></div>').appendTo('body').css({
					position: 'fixed',
					top: 0,
					left: 0,
					right: 0,
					zIndex: 1000, // above the toolbar (100) and everything else - see the z-index contract
					background: '#b35c00',
					color: '#fff',
					padding: '8px 16px',
					fontFamily: 'sans-serif',
					fontSize: '13px',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
				});
				$('<span class="monitorModeBanner-text"></span>').appendTo($banner);
				$('<button class="monitorModeBanner-stop">Stop Monitoring</button>')
					.appendTo($banner)
					.css({
						marginLeft: '12px',
						cursor: 'pointer',
						background: '#fff',
						color: '#b35c00',
						border: 'none',
						borderRadius: '3px',
						padding: '4px 10px',
						fontSize: '13px',
						fontWeight: 'bold',
					})
					.on('click', function() {
						window.app.vent.trigger('Monitor:stop');
					});
			}
			$banner.find('.monitorModeBanner-text').text(text);
			$banner.show();
		},

		hideBanner: function hideBanner() {
			$('#monitorModeBanner').remove();
		},
	};

	return MonitorController;
});
