define([], function() {
	'use strict';

	// Build-time configuration for the client. This is the dev/default
	// version (serial ON). buildScripts/packageElectron.js overwrites the
	// copy in server/dist/scripts/ with `serial: false` when packaging a
	// serial-free build (--no-serial, and automatically for any non-macOS
	// target, since the @serialport/bindings native module can't be
	// cross-compiled from this machine).
	//
	// Loaded as an AMD dependency (not fetched async) so it's guaranteed
	// resolved before application.js / any widget runs - no ordering race.
	return {
		serial: true,
	};
});
