// Windows: is NTK running from a network or shared folder?
//
// Run from one - a folder shared from the Mac into a Parallels or VMware
// virtual machine (\\Mac\Home\..., \\psf\..., or a drive letter mapped to
// it), or any network drive - Chromium's GPU process can't start, and NTK
// quit at launch with nothing on screen but "GPU process isn't usable" in a
// log nobody sees (found on Windows 11 in Parallels, 2026-11-06). The fix is
// to copy the folder to the PC's own drive; electronApp.js uses this to say
// so instead of vanishing.
//
// sharedLocation() returns a short description of where NTK is running from
// when that's a shared location, or null - always null off Windows.
// NTK_SIMULATE_SHARED_PATH stands in for the app's path, to try the warning
// on a Mac.

const path = require('path');
const { execFileSync } = require('child_process');

// Drive letters mapped to network shares, from `net use` (on every Windows;
// Node has no call for a drive's type). Lines look like
//   "OK           Z:        \\Mac\Home        Microsoft Windows Network"
function mappedNetworkDrives() {
	try {
		const out = execFileSync('net', ['use'], { encoding: 'utf8', timeout: 3000, windowsHide: true });
		const drives = {};
		out.split(/\r?\n/).forEach(function(line) {
			const m = line.match(/\s([A-Za-z]):\s+(\\\\\S+)/);
			if (m) { drives[m[1].toUpperCase()] = m[2]; }
		});
		return drives;
	} catch (e) {
		return {};
	}
}

module.exports = function sharedLocation() {
	const simulated = process.env.NTK_SIMULATE_SHARED_PATH;
	if (process.platform !== 'win32' && !simulated) { return null; }

	const appDir = simulated || path.dirname(process.execPath);
	// \\Mac\Home\..., \\psf\..., \\server\share\...
	if (/^\\\\/.test(appDir)) { return appDir; }

	if (process.platform !== 'win32') { return null; }
	const letter = (appDir.match(/^([A-Za-z]):/) || [])[1];
	if (!letter) { return null; }
	const share = mappedNetworkDrives()[letter.toUpperCase()];
	return share ? letter.toUpperCase() + ': (' + share + ')' : null;
};
