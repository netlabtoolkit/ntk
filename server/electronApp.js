
const electron = require('electron');
var Menu = electron.Menu
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const dialog = electron.dialog;
const ipcMain = electron.ipcMain;
const shell = electron.shell;
const path = require('path');
const fs = require('fs');
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

  // Widget help links (target="_blank") should open in the user's real
  // browser, not get silently denied (Electron's default for
  // window.open/target=_blank) or load inside a chromeless BrowserWindow.
  mainWindow.webContents.setWindowOpenHandler(function(details) {
	  shell.openExternal(details.url);
	  return {action: 'deny'};
  });

  // Emitted when the window is closed.
  mainWindow.on('closed', function() {
    mainWindow = null;
  });


  // Built dynamically from whatever .ntk files are in examplePatches -
  // adding a new example is just dropping a file in that folder, no menu
  // code changes needed.
  var examplePatchesDir = path.join(__dirname, 'examplePatches');
  var exampleMenuItems = [];
  try {
	  exampleMenuItems = fs.readdirSync(examplePatchesDir)
		  .filter(function(file) { return file.endsWith('.ntk'); })
		  .map(function(file) {
			  return {
				  label: file.replace(/\.ntk$/, ''),
				  click: function() {
					  if(mainWindow) {
						  var patchJSON = fs.readFileSync(path.join(examplePatchesDir, file), 'utf8');
						  // Loads into the UI without touching the user's saved
						  // currentPatch.ntk (loadPatch's second "save" arg is
						  // omitted/falsy) - same as opening a file shouldn't
						  // silently overwrite your last save.
						  mainWindow.webContents.executeJavaScript(
							  "window.app.vent.trigger('ToolBar:loadPatch', " + JSON.stringify(patchJSON) + ");"
						  );
					  }
				  }
			  };
		  });
  } catch(e) {
	  // examplePatches directory missing - fall through to the empty-list case below
  }

  if(exampleMenuItems.length === 0) {
	  exampleMenuItems = [{ label: "No examples found", enabled: false }];
  }

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
			  }},
			  { type: "separator" },
			  { label: "Open Example", submenu: exampleMenuItems }
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
		  ]}, {
		  label: "View",
		  submenu: [
			  { label: "Toggle Developer Tools", accelerator: "CmdOrCtrl+Alt+I", click: function() {
				  if(mainWindow) {
					  mainWindow.webContents.toggleDevTools();
				  }
			  }}
		  ]}
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  // turn on devTools to show inspector/console in app version
  //mainWindow.webContents.openDevTools();
});
