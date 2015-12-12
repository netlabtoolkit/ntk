
const electron = require('electron');
var Menu = require("menu");
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const ntk = require('./netlabServer.js')();

// Report crashes to our server.
electron.crashReporter.start();

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
	  nodeIntegration: false,
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
		  { label: "About Application", selector: "orderFrontStandardAboutPanel:" },
		  { type: "separator" },
		  { label: "Quit", accelerator: "Command+Q", click: function() { app.quit(); }}
	  ]}, {
		  label: "Edit",
		  submenu: [
			  { label: "Undo", accelerator: "CmdOrCtrl+Z", selector: "undo:" },
			  { label: "Redo", accelerator: "Shift+CmdOrCtrl+Z", selector: "redo:" },
			  { type: "separator" },
			  { label: "Cut", accelerator: "CmdOrCtrl+X", selector: "cut:" },
			  { label: "Copy", accelerator: "CmdOrCtrl+C", selector: "copy:" },
			  { label: "Paste", accelerator: "CmdOrCtrl+V", selector: "paste:" },
			  { label: "Select All", accelerator: "CmdOrCtrl+A", selector: "selectAll:" }
		  ]}
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
});

