/**
 * MonitorController - "monitor mode": watch a running standalone
 * patch's live values without taking over from it (see
 * plans/standalone-patch-export.md and the firmware-monitor-mode
 * branch history for the full design).
 *
 * Deliberately all-or-nothing, not per-widget (see the session that
 * scoped this) - window.app.monitoring is one global flag every
 * widget's own signal-chain code checks (see WidgetMulti.js's
 * processSignalChain) to decide whether to compute its own value
 * locally or just display whatever's been pushed in. There is
 * currently no way to monitor one device while separately, locally
 * controlling widgets on another - that's a real but deliberately
 * deferred gap (see the session notes), not an oversight.
 *
 * v1 limitation, also deliberate: this does NOT load a patch for you.
 * You must already have the same patch (matching wids) loaded in NTK's
 * own canvas before starting monitor mode, e.g. via the normal Load
 * Patch action on the exact standalone_patch.json the device is
 * running - a "pull the current patch from the device first" flow is
 * planned but not built yet, so a currently-loaded patch that doesn't
 * match won't error, it'll just silently show no values for any wid
 * NTK doesn't recognize.
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
		},

		start: function start(options) {
			this.host = options.host;
			this.port = options.port;
			this.active = true;
			window.app.monitoring = {active: true, host: this.host, port: this.port};
			this.showBanner('Connecting to ' + this.host + ':' + this.port + '...');
			window.app.vent.trigger('startMonitor', {host: this.host, port: this.port});
		},

		stop: function stop() {
			this.active = false;
			window.app.monitoring = {active: false};
			window.app.vent.trigger('stopMonitor');
			this.hideBanner();
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
			var widgetView = _.find(app.Patcher.Controller.widgets, function(view) {
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
					.css({marginLeft: '12px', cursor: 'pointer'})
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
