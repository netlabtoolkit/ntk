
const electron = require('electron');
var Menu = electron.Menu
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const dialog = electron.dialog;
const ipcMain = electron.ipcMain;
const shell = electron.shell;
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ntk = require('./netlabServer.js')();

// ---- SpeechIn: Apple Speech (SFSpeechRecognizer) helper ----
// One speechhelper child process per SpeechIn widget, keyed by widget id.
// See server/speechHelper/speechhelper.swift for the stdin/stdout protocol.
// macOS only - on other platforms speechAvailable() is false and the
// SpeechIn widget shows "not available".

// The binary can't run from inside app.asar, so packageElectron.js unpacks
// it; in dev (__dirname = .../server) the .replace is a no-op.
const SPEECH_HELPER_PATH = path
	.join(__dirname, 'speechHelper', 'speechhelper')
	.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
const speechHelperAvailable = process.platform === 'darwin' && fs.existsSync(SPEECH_HELPER_PATH);

const speechHelpers = new Map(); // wid -> ChildProcess

function speechHelperFor(wid) {
	let child = speechHelpers.get(wid);
	if (child && !child.killed) return child;

	child = spawn(SPEECH_HELPER_PATH, [], { stdio: ['pipe', 'pipe', 'pipe'] });
	speechHelpers.set(wid, child);

	let buf = '';
	child.stdout.on('data', function(chunk) {
		buf += chunk.toString();
		let nl;
		while ((nl = buf.indexOf('\n')) !== -1) {
			const line = buf.slice(0, nl).trim();
			buf = buf.slice(nl + 1);
			if (!line) continue;
			let msg;
			try { msg = JSON.parse(line); } catch (e) { continue; }
			// Log everything except the per-word partial stream.
			if (msg.type !== 'partial') console.log('speechhelper[' + wid + ']', line);
			if (mainWindow && !mainWindow.isDestroyed()) {
				mainWindow.webContents.send('speech-result', Object.assign({ wid: wid }, msg));
			}
		}
	});
	child.stderr.on('data', function(chunk) {
		console.log('speechhelper[' + wid + '] stderr:', chunk.toString().trim());
	});
	child.on('exit', function() {
		speechHelpers.delete(wid);
	});
	return child;
}

function quitSpeechHelper(wid) {
	const child = speechHelpers.get(wid);
	if (!child) return;
	try { child.stdin.write('quit\n'); } catch (e) {}
	setTimeout(function() { try { child.kill(); } catch (e) {} }, 500);
	speechHelpers.delete(wid);
}

ipcMain.handle('speech-available', function() {
	return speechHelperAvailable;
});
ipcMain.handle('speech-start', function(event, opts) {
	if (!speechHelperAvailable) return false;
	const child = speechHelperFor(opts.wid);
	try { child.stdin.write('start ' + (opts.locale || 'en-US') + '\n'); } catch (e) { return false; }
	return true;
});
ipcMain.handle('speech-stop', function(event, opts) {
	const child = speechHelpers.get(opts.wid);
	if (child) { try { child.stdin.write('stop\n'); } catch (e) {} }
	return true;
});
ipcMain.handle('speech-quit', function(event, opts) {
	quitSpeechHelper(opts.wid);
	return true;
});
app.on('will-quit', function() {
	for (const wid of speechHelpers.keys()) quitSpeechHelper(wid);
});

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

  // Explicit camera/mic permission handling, rather than relying on
  // Electron's own default behavior for unhandled permission requests -
  // this window only ever loads our own bundled local server
  // (localhost:9001, never third-party/remote content), so unconditionally
  // granting 'media' here is safe. Added after a real bug: PoseTrack's
  // camera worked on first use, but unchecking its "active" box (stopping
  // all tracks) and re-checking it (a fresh getUserMedia() call) failed
  // outright with "Permission denied" and no OS dialog at all the second
  // time - both setPermissionRequestHandler (the async "grant a NEW
  // request" path) and setPermissionCheckHandler (the synchronous "is this
  // CURRENTLY permitted" path Chromium also consults internally) need to
  // agree, or a stale/inconsistent default on one of the two paths can
  // silently deny a later request without ever prompting.
  mainWindow.webContents.session.setPermissionRequestHandler(function(webContents, permission, callback) {
	  callback(permission === 'media');
  });
  mainWindow.webContents.session.setPermissionCheckHandler(function(webContents, permission) {
	  return permission === 'media';
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
