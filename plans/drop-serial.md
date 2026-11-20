# Dropping USB serial support

Step 6 of the [build order](README.md#proposed-build-order), first half: remove NTK's USB serial connection to boards (the **Serial** device option, `ArduinoModel.js`, `@serialport/bindings`), leaving WiFi (Network) as the only way NTK talks to a board. Not started; assessed 2026-11-20. The second half of step 6, replacing Firmata itself, is a separate decision (see [What it doesn't remove](#what-it-doesnt-remove)).

## Recommendation

Do it. Every board in use is CircuitPython over WiFi, nobody depends on serial (see [Project context](README.md#project-context)), and it unblocks the [iPadOS port](ipados-port.md). But first make WiFi setup as easy as plugging in a cable is now (see [Before dropping it](#before-dropping-it)), so the first five minutes for a new user don't get harder.

## Benefits

- **One build for every platform.** `@serialport/bindings` is a native Node addon that can't be cross-compiled from the Mac, which is why the Windows zip is already serial-free. Without it, every platform gets the same pure-JS bundle, and a Linux build is close to free.
- **Simpler Mac signing and Electron upgrades.** The native `.node` file is why `buildScripts/entitlements.mac.plist` needs `disable-library-validation` (Apple's hardened runtime otherwise refuses an addon not signed with NTK's Team ID), and it has to be rebuilt for every Electron version (`npm run rebuild`, `electron-rebuild --only @serialport/bindings`). Both go.
- **Less code.** `ArduinoModel.js`, the `'ArduinoUno'` / `auto` device type and its defaults in every hardware widget (`getDeviceModelType`, `getDeviceServerName`), the client's `buildConfig.serial` switch (`buildConfig.js`, `application.js`, `WidgetMulti.js`, `ToolBar.js`), and `packageElectron.js`'s serial-free `afterCopy` hook that deletes the serialport packages and drops in a stub.
- **Simpler for users.** One way to connect, so the Device menu, the "more" panels and the docs lose a choice, and there's no "which port is my board on" step.
- **Unblocks the iPad.** Serial was the [iPadOS port](ipados-port.md)'s one hard blocker.

## What it doesn't remove

**johnny-five and firmata stay.** The WiFi path uses them too: `NetworkModel.js` builds a johnny-five board on `firmata` over `etherport-client`, and `StandardFirmataModel.js` (shared by both paths) is built on johnny-five. Dropping serial removes only `serialport` / `@serialport/bindings` and `ArduinoModel.js`. Getting rid of johnny-five, firmata and their Dependabot alerts needs the Firmata → native-protocol replacement in [standalone patch export](standalone-patch-export.md) (the rest of step 6).

It also doesn't touch the board's own USB console: Thonny, `print()` output and file copying over USB are CircuitPython's, not NTK's.

## Costs

- **Boards without WiFi stop working.** A classic Arduino Uno running StandardFirmata over USB has no way in. No current users have one, but students might.
- **Networks that block devices.** Campus WiFi (eduroam and the like) often isolates clients from each other or won't let a microcontroller join. The board's own hotspot (SoftAP, see [device discovery](device-discovery.md)) works around it, but the laptop then has to switch to the board's network, which is where people get stuck.
- **Setup before anything works.** A new board needs WiFi credentials in `settings.toml` before NTK can reach it, while USB works on plug-in.
- **WiFi is less reliable than a cable.** The C6's reporting-rate limit (it can't report faster than every 50 ms) and "WiFi dropped" resets are WiFi problems USB doesn't have, and a crowded room makes them worse.

## Before dropping it

Make WiFi setup as easy as USB:

- **First-time setup over USB.** NTK writes the board's `settings.toml` (network name, password, device name) over the board's USB drive or REPL, then the board joins WiFi. Plug in once, then it's wireless. Works on Windows too, since it's the CIRCUITPY drive or a REPL, not the serialport addon (Web Serial in Electron's Chromium is an option for the REPL route).
- **Or a guided SoftAP setup.** NTK walks the user through joining the board's hotspot and entering their WiFi details there.
- Keep mDNS (`ntk-device.local`) as the default address, so nobody types an IP.

## What changes for the Windows build

Very little for Windows users: today's Windows zip is already serial-free, WiFi only. What changes is on the build side:

- **Same code on every platform.** The Mac and Windows builds stop differing, so what's tested on the Mac is what Windows runs. The `--no-serial` stub, the `buildConfig.js` rewrite and the "built on a Mac, without serial support" note in every release disappear.
- **No new Windows capability.** Still unsigned (SmartScreen's "Run anyway" on first launch, until there's an Authenticode certificate), and still not run on real Windows by anyone.
- **Could build in CI.** With no native modules, GitHub Actions could build Windows (and Linux) on each release instead of the Mac cross-build, a smaller convenience.

## Work involved

1. Remove the **Serial** device option and the `'ArduinoUno'` / `auto` defaults; default every hardware widget to Network. A saved patch with `deviceType: 'ArduinoUno'` loads as Network (or shows a clear message), rather than silently failing.
2. Delete `ArduinoModel.js` and its branch in `nlHardware/Hardware.js` / `nlMultiClientSync.js`.
3. Remove `serialport` from `server/package.json` (check johnny-five doesn't pull it in as a hard dependency; today it's required lazily), the `rebuild` npm script, `buildConfig.serial`, and `packageElectron.js`'s serial-free hook and `--no-serial` flag.
4. Drop `disable-library-validation` from the entitlements, then sign, notarize and check the camera, mic and speech helpers still work.
5. Docs: remove Serial from widget "more panel" sections and setup pages; release notes say it's gone.
