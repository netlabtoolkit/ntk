define([], function() {
	'use strict';

	// Shared by CloudIn/CloudOut: what their connection indicator shows.
	// Before this, the indicator was a bare connected/not-connected
	// boolean - a broker rejecting the credentials ("Connection refused:
	// Not authorized") looked exactly like "hasn't connected yet", so a
	// wrong user/password failed with nothing on screen at all (found
	// 2026-10-03; the reason was only ever in the server console). The
	// widget body is narrow, so the label is a short form and the
	// broker's full message goes in `detail` (shown as a tooltip).
	var SHORT_ERRORS = [
		// Both are the broker rejecting the login - MQTT's "Not
		// authorized" (CONNACK 5) is what Adafruit IO answers for a
		// wrong username or key, and says nothing useful as-is.
		[/not authorized|bad user ?name or password/i, 'Bad user/pass'],
		[/ENOTFOUND|EAI_AGAIN/, 'Host not found'],
		[/ECONNREFUSED/, 'Refused'],
		[/ETIMEDOUT|timeout/i, 'Timed out'],
		[/no broker host/i, 'No host set'],
	];

	return {
		// active: the widget's own on/off toggle; connected: the shared
		// broker connection's state; lastError: the most recent error
		// string the server reported for it, or null.
		// topicError: the most recent problem reported for THIS widget's
		// topic (see topicErrorFor) - the connection itself is usually
		// fine when there is one, so it outranks "Connected".
		// waitingForData (CloudIn only): connected and subscribed, but
		// nothing has arrived on the topic since - which is all that can
		// be said about a wrong topic on a broker that accepts any
		// subscription silently.
		describe: function(active, connected, lastError, topicError, waitingForData) {
			if (active && connected && topicError) {
				return {cloudStatusLabel: 'Topic error', cloudError: true, cloudWaiting: false, cloudErrorDetail: String(topicError)};
			}
			if (active && connected && waitingForData) {
				return {cloudStatusLabel: 'No data yet', cloudError: false, cloudWaiting: true, cloudErrorDetail: 'Connected, but nothing has arrived on this topic yet - check the topic if it should have'};
			}
			if (active && connected) {
				return {cloudStatusLabel: 'Connected', cloudError: false, cloudWaiting: false, cloudErrorDetail: ''};
			}
			if (active && lastError) {
				var label = 'Connect error';
				for (var i = 0; i < SHORT_ERRORS.length; i++) {
					if (SHORT_ERRORS[i][0].test(lastError)) { label = SHORT_ERRORS[i][1]; break; }
				}
				return {cloudStatusLabel: label, cloudError: true, cloudWaiting: false, cloudErrorDetail: String(lastError)};
			}
			return {cloudStatusLabel: 'Not connected', cloudError: false, cloudWaiting: false, cloudErrorDetail: ''};
		},
		// A 'status' with an error sets it; only a successful connect
		// clears it. The 'close'/'reconnect' statuses that follow every
		// failed attempt carry no error of their own and must not wipe
		// the reason before anyone has read it.
		// A status carrying topicError applies to a widget when it names
		// that widget's own topic, or no topic at all (broker-wide, e.g.
		// Adafruit IO's errors/throttle notices). Nothing here ever
		// clears it - a later ordinary status says nothing about whether
		// the topic is now fine - so the widgets reset it themselves
		// when the topic or connection settings change, or the widget is
		// switched off.
		topicErrorFor: function(lastTopicError, info, widgetTopic) {
			if (info && info.topicError && (!info.topic || info.topic === widgetTopic)) {
				return info.topicError;
			}
			return lastTopicError;
		},
		nextError: function(lastError, info) {
			if (info && info.error) { return info.error; }
			if (info && info.connected) { return null; }
			return lastError;
		},
	};
});
