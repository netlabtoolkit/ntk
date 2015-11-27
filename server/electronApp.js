
const electron = require('electron');
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const ntk = require('./netlabServer.js')();

// Report crashes to our server.
electron.crashReporter.start();

var mainWindow = null;

// Quit when all windows are closed.
app.on('window-all-closed', function() {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform != 'darwin') {
    app.quit();
  }
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.on('ready', function() {

  mainWindow = new BrowserWindow({
	  width: 1024,
	  height: 768,
	  title: "NTK",
	  autoHideMenuBar: true,
	  nodeIntegration: false,
  });

  mainWindow.loadURL('http://localhost:9001');

  // Emitted when the window is closed.
  mainWindow.on('closed', function() {
    mainWindow = null;
  });
});

