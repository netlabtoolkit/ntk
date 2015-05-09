var page = require('webpage').create();

// Error logging from the page
page.onError = function(msg, trace) {

	var msgStack = ['ERROR: ' + msg];

	if (trace && trace.length) {
		msgStack.push('TRACE:');
		trace.forEach(function(t) {
			msgStack.push(' -> ' + t.file + ': ' + t.line + (t.function ? ' (in function "' + t.function +'")' : ''));
		});
	}

	console.error(msgStack.join('\n'));

};
// Console logging
page.onConsoleMessage = function(msg, lineNum, sourceId) {
	console.log('CONSOLE: ' + msg + ' (from line #' + lineNum + ' in "' + sourceId + '")');
};

page.open('http://localhost:9001/server/#server', function() {
});
