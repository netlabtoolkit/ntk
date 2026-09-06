const { contextBridge, ipcRenderer } = require('electron');

// Exposed to the renderer despite contextIsolation - lets media widgets (Video.js,
// Audio.js, Image.js) open a native file picker and get back an absolute path,
// without needing nodeIntegration. The renderer never touches fs/dialog directly.
contextBridge.exposeInMainWorld('ntkElectron', {
	pickVideoFile: function() {
		return ipcRenderer.invoke('pick-video-file');
	},
	pickAudioFile: function() {
		return ipcRenderer.invoke('pick-audio-file');
	},
	pickImageFile: function() {
		return ipcRenderer.invoke('pick-image-file');
	},

	// SpeechIn (Apple Speech helper). macOS only - speechAvailable() is
	// false elsewhere. See server/electronApp.js and
	// server/speechHelper/speechhelper.swift.
	speechAvailable: function() {
		return ipcRenderer.invoke('speech-available');
	},
	speechStart: function(wid, locale) {
		return ipcRenderer.invoke('speech-start', { wid: wid, locale: locale });
	},
	speechStop: function(wid) {
		return ipcRenderer.invoke('speech-stop', { wid: wid });
	},
	speechQuit: function(wid) {
		return ipcRenderer.invoke('speech-quit', { wid: wid });
	},
	// Returns an unsubscribe function.
	onSpeechResult: function(callback) {
		var listener = function(event, data) { callback(data); };
		ipcRenderer.on('speech-result', listener);
		return function() { ipcRenderer.removeListener('speech-result', listener); };
	},
});
