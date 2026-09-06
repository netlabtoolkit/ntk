
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

// ---- Apple speech helpers (macOS only) ----
// SpeechIn -> speechhelper.swift (SFSpeechRecognizer); SpeechOut ->
// ttshelper.swift (AVSpeechSynthesizer, reaches the Enhanced/Premium
// voices Chromium's speechSynthesis can't). One child process per widget,
// keyed by widget id. On other platforms *Available() is false and the
// widgets fall back (SpeechIn -> "not available", SpeechOut -> browser
// speechSynthesis). The binaries can't run from inside app.asar, so
// packageElectron.js unpacks them; in dev (__dirname = .../server) the
// .replace is a no-op.
function helperPath(name) {
	return path.join(__dirname, 'speechHelper', name)
		.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
}

// Makes a { available, childFor, quit, quitAll } manager for one helper
// binary. `resultChannel` is the ipc channel each JSON line is forwarded
// on (with {wid} added); `onMessage` is an optional main-process hook.
function makeHelperManager(binaryName, resultChannel, onMessage) {
	const binPath = helperPath(binaryName);
	const available = process.platform === 'darwin' && fs.existsSync(binPath);
	const procs = new Map(); // wid -> ChildProcess

	function childFor(wid) {
		let child = procs.get(wid);
		if (child && !child.killed) return child;

		child = spawn(binPath, [], { stdio: ['pipe', 'pipe', 'pipe'] });
		procs.set(wid, child);

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
				if (onMessage) onMessage(wid, msg);
				if (msg.type !== 'partial' && msg.type !== 'word' && msg.type !== 'voices') {
					console.log(binaryName + '[' + wid + ']', line);
				}
				if (mainWindow && !mainWindow.isDestroyed()) {
					mainWindow.webContents.send(resultChannel, Object.assign({ wid: wid }, msg));
				}
			}
		});
		child.stderr.on('data', function(chunk) {
			console.log(binaryName + '[' + wid + '] stderr:', chunk.toString().trim());
		});
		child.on('exit', function() { procs.delete(wid); });
		return child;
	}

	function quit(wid) {
		const child = procs.get(wid);
		if (!child) return;
		try { child.stdin.write('quit\n'); } catch (e) {}
		setTimeout(function() { try { child.kill(); } catch (e) {} }, 500);
		procs.delete(wid);
	}

	return {
		available: available,
		childFor: childFor,
		write: function(wid, line) {
			const child = childFor(wid);
			try { child.stdin.write(line + '\n'); return true; } catch (e) { return false; }
		},
		writeExisting: function(wid, line) {
			const child = procs.get(wid);
			if (child) { try { child.stdin.write(line + '\n'); } catch (e) {} }
		},
		quit: quit,
		quitAll: function() { for (const wid of procs.keys()) quit(wid); },
	};
}

// Spawn a throwaway helper just to grab one startup message (the locale
// list / voice list, both reported before any TCC prompt), then quit it.
function queryHelperOnce(binaryName, wantType, key) {
	return new Promise(function(resolve) {
		const child = spawn(helperPath(binaryName), [], { stdio: ['pipe', 'pipe', 'ignore'] });
		let buf = '';
		const done = function(v) { try { child.stdin.write('quit\n'); } catch (e) {} resolve(v || []); };
		const t = setTimeout(function() { done([]); }, 3000);
		child.stdout.on('data', function(c) {
			buf += c.toString();
			let nl;
			while ((nl = buf.indexOf('\n')) !== -1) {
				const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
				try {
					const m = JSON.parse(line);
					if (m.type === wantType) { clearTimeout(t); done(m[key]); return; }
				} catch (e) {}
			}
		});
		child.on('error', function() { clearTimeout(t); done([]); });
	});
}

// --- SpeechIn ---
let sttLocalesCache = null;
const stt = makeHelperManager('speechhelper', 'speech-result', function(wid, msg) {
	if (msg.type === 'locales' && Array.isArray(msg.locales)) sttLocalesCache = msg.locales;
});
ipcMain.handle('speech-available', function() { return stt.available; });
ipcMain.handle('speech-locales', function() {
	if (sttLocalesCache) return sttLocalesCache;
	if (!stt.available) return [];
	return queryHelperOnce('speechhelper', 'locales', 'locales').then(function(v) {
		if (Array.isArray(v) && v.length) sttLocalesCache = v;
		return sttLocalesCache || [];
	});
});
ipcMain.handle('speech-start', function(event, opts) {
	if (!stt.available) return false;
	return stt.write(opts.wid, 'start ' + (opts.locale || 'en-US'));
});
ipcMain.handle('speech-stop', function(event, opts) { stt.writeExisting(opts.wid, 'stop'); return true; });
ipcMain.handle('speech-quit', function(event, opts) { stt.quit(opts.wid); return true; });

// --- SpeechOut ---
let ttsVoicesCache = null;
const tts = makeHelperManager('ttshelper', 'tts-result', function(wid, msg) {
	if (msg.type === 'voices' && Array.isArray(msg.voices)) ttsVoicesCache = msg.voices;
});
ipcMain.handle('tts-available', function() { return tts.available; });
ipcMain.handle('tts-voices', function() {
	if (ttsVoicesCache) return ttsVoicesCache;
	if (!tts.available) return [];
	return queryHelperOnce('ttshelper', 'voices', 'voices').then(function(v) {
		if (Array.isArray(v) && v.length) ttsVoicesCache = v;
		return ttsVoicesCache || [];
	});
});
ipcMain.handle('tts-speak', function(event, opts) {
	if (!tts.available) return false;
	return tts.write(opts.wid, 'speak ' + JSON.stringify({
		text: opts.text || '',
		voice: opts.voice || '',
		rate: opts.rate,
		pitch: opts.pitch,
	}));
});
ipcMain.handle('tts-stop', function(event, opts) { tts.writeExisting(opts.wid, 'stop'); return true; });
ipcMain.handle('tts-quit', function(event, opts) { tts.quit(opts.wid); return true; });

app.on('will-quit', function() { stt.quitAll(); tts.quitAll(); });

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
			  { label: "Reload", accelerator: "CmdOrCtrl+R", click: function() {
				  if(mainWindow) { mainWindow.webContents.reload(); }
			  }},
			  { label: "Force Reload", accelerator: "Shift+CmdOrCtrl+R", click: function() {
				  if(mainWindow) { mainWindow.webContents.reloadIgnoringCache(); }
			  }},
			  { type: "separator" },
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
