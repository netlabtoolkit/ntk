var gaze = require('gaze'),
	childProcess = require('child_process');

var currentlyLoading = false;

var recompileSCSS = function reloadPage() {
	if(!currentlyLoading) {
		currentlyLoading = true;
		console.log('Re-compiling SCSS files');
		childProcess.execFile('npm', ['run','compileSCSS'], function() {
			console.log('Refreshed');
			copyScripts();
		});
	}
};

var copyScripts = function reloadPage() {
	console.log('Reloading scripts');
	childProcess.execFile('npm', ['run','copyAppToDist'], function() {
		currentlyLoading = false;
		console.log('Reloaded scripts');
	});
};

gaze(["app/scripts/**/*.js", "app/styles/**/*.scss", "app/scripts/views/**/*.scss"], function(err, watching) {
	this.on('all', recompileSCSS);
});


