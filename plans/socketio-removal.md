# socket.io removal

**Status:** planned as part of build-order steps 1–2 (see
[README.md](README.md#proposed-build-order)). Not started.

`server/`'s `socket.io: "~1.0.0"` (pinned since ~2014) is the root cause
of most of the security-audit findings in the shipped Electron app —
ws, engine.io, xmlhttprequest, debug, parsejson, parseuri are all
transitively vulnerable.

## Not an upgrade — a removal

`npm audit fix --force` would jump to `socket.io@4.8.3`, but that's a
wire-protocol breaking change requiring the client-side `socket.io.js`
served to the browser and `nlMultiClientSync.js` to move in lockstep,
plus real testing of live multi-client patch sync.

Instead: **remove socket.io entirely**, along with Express,
`nlMultiClientSync.js`, and `npm start`. With no current users and nobody
exercising remote / multi-client access
(see [README.md](README.md#project-context)), the Express / socket.io
server is being replaced outright with **Electron IPC** — extending the
`contextBridge` pattern `server/preload.js` already uses for the file
picker — rather than migrated to v4.

This CVE resolves itself once the dependency is removed — no v1→v4
migration or testing needed at all.

## Why it's bundled with the wiring rebuild

socket.io is one of the wiring systems the [Macro widget](macro-widget.md)
touches (cross-process mapping / model sync — `SocketAdapter.js` /
`nlMultiClientSync.js`). It was originally going to be *upgraded*
alongside Macro work so the sync layer got tested once instead of twice.
Now it's *removed* alongside that same work, which fully resolves Macro's
wiring-system concern rather than leaving it conditional.

## What "Electron IPC" concretely means

An Electron app is two processes: a **main process** (plain Node.js; runs
Express / socket.io and all hardware / Firmata code today) and a
**renderer process** (sandboxed Chromium running NTK's `app/` UI, no
direct Node / `fs` / socket access by default). Today they talk over an
*actual TCP loopback socket* — the renderer's socket.io client connects
to `127.0.0.1:9001` exactly as it would to a remote machine, and every
model / mapping change gets JSON-serialized through that connection.

Electron IPC is Electron's own purpose-built main↔renderer channel —
`ipcMain` / `ipcRenderer`, exposed to the page via
`contextBridge.exposeInMainWorld(...)` in a preload script — with no
network stack, no HTTP, no socket.io framing. `server/preload.js` is a
live working example today:

```js
contextBridge.exposeInMainWorld('ntkElectron', {
    pickVideoFile: function() { return ipcRenderer.invoke('pick-video-file'); },
});
```

`Video.js` calls `window.ntkElectron.pickVideoFile()`, handled on the
main side by `ipcMain.handle('pick-video-file', ...)`. The plan is to
extend this same pattern to cover everything socket.io currently carries
(model updates, mapping / cable changes, patch load / save) — not to
introduce a new unfamiliar mechanism.

## Unrelated, already fixed

The `underscore` critical-CVE finding from the same audit pass was fixed
separately (bumped `~1.4.4` → `^1.13.8` in both `package.json` and
`server/package.json`, 2026-08-26).
