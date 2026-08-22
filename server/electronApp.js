
const electron = require('electron');
var Menu = electron.Menu
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const dialog = electron.dialog;
const ipcMain = electron.ipcMain;
const path = require('path');
const ntk = require('./netlabServer.js')();

var pickFile = async function(dialogName, extensions) {
	var result = await dialog.showOpenDialog(mainWindow, {
		properties: ['openFile'],
		filters: [{ name: dialogName, extensions: extensions }],
	});

	if (result.canceled || result.filePaths.length === 0) {
		return null;
	}

	return result.filePaths[0];
};

ipcMain.handle('pick-video-file', function() {
	return pickFile('Videos', ['mp4', 'mov', 'm4v', 'webm', 'ogv']);
});
ipcMain.handle('pick-audio-file', function() {
	return pickFile('Audio', ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac']);
});
ipcMain.handle('pick-image-file', function() {
	return pickFile('Images', ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp']);
});

var mainWindow = null;

// Quit when all windows are closed.
app.on('window-all-closed', function() {
	app.quit();
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.on('ready', function() {

  mainWindow = new BrowserWindow({
	  width: 1024,
	  height: 768,
	  title: "NTK",
	  autoHideMenuBar: true,
	  webPreferences: {
		  nodeIntegration: false,
		  contextIsolation: true,
		  preload: path.join(__dirname, 'preload.js'),
	  },
  });

  mainWindow.loadURL('http://localhost:9001');

  // Emitted when the window is closed.
  mainWindow.on('closed', function() {
    mainWindow = null;
  });


  // Create the Application's main menu
  var template = [{
	  label: "Application",
	  submenu: [
		  { label: "About Application", role: "about" },
		  { type: "separator" },
		  { label: "Quit", accelerator: "Command+Q", click: function() { app.quit(); }}
	  ]}, {
		  label: "File",
		  submenu: [
			  { label: "Save", accelerator: "CmdOrCtrl+S", click: function() {
				  if(mainWindow) {
					  mainWindow.webContents.executeJavaScript("window.app.vent.trigger('ToolBar:savePatch');");
				  }
			  }}
		  ]}, {
		  label: "Edit",
		  submenu: [
			  { label: "Undo", accelerator: "CmdOrCtrl+Z", role: "undo" },
			  { label: "Redo", accelerator: "Shift+CmdOrCtrl+Z", role: "redo" },
			  { type: "separator" },
			  { label: "Cut", accelerator: "CmdOrCtrl+X", role: "cut" },
			  { label: "Copy", accelerator: "CmdOrCtrl+C", role: "copy" },
			  { label: "Paste", accelerator: "CmdOrCtrl+V", role: "paste" },
			  { label: "Select All", accelerator: "CmdOrCtrl+A", role: "selectAll" }
		  ]}
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  // turn on devTools to show inspector/console in app version
  //mainWindow.webContents.openDevTools();
});
