/**
 * HostPing - one ICMP ping to a host using the system's own ping
 * command, calling back true if it answered. Used to tell a device that
 * is on the network but busy (it serves one client at a time, so NTK on
 * another computer can be holding it) from one that's off or at the
 * wrong address - both just time out on a TCP connection. See
 * nlMultiClientSync.js's client:checkDeviceStatus.
 *
 * Success is a reply line containing "ttl=" rather than the exit code:
 * Windows' ping exits 0 even for "Destination host unreachable" (that
 * reply comes from the router, without a TTL).
 */
module.exports = function pingHost(host, callback) {
	var execFile = require('child_process').execFile;
	var args;
	if (process.platform === 'win32') {
		args = ['-n', '1', '-w', '1500', host];
	} else if (process.platform === 'darwin') {
		args = ['-c', '1', '-t', '2', host];
	} else {
		args = ['-c', '1', '-W', '2', host];
	}
	execFile('ping', args, {timeout: 4000, windowsHide: true}, function(err, stdout) {
		callback(/ttl=/i.test(String(stdout || '')));
	});
};
