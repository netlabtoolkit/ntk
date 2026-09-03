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
});
