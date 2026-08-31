#!/usr/bin/env node
'use strict';

// Packages the Electron app and, on macOS, signs + notarizes it with
// Apple Developer ID so the built .app runs without a Gatekeeper warning.
//
// One-time setup on a machine that will run this script:
//  1. Install the "Developer ID Application" certificate (and its private
//     key) for the team below into the login keychain.
//  2. Generate an app-specific password at https://appleid.apple.com
//     ("Sign-In and Security" > "App-Specific Passwords"), then store
//     notarization credentials once (never committed to the repo):
//       xcrun notarytool store-credentials NTK-notarize \
//         --apple-id "<your Apple ID email>" \
//         --team-id 2E2K9GSX37 \
//         --password "<the app-specific password>"
//
// Signing is skipped automatically if the identity below isn't found in
// the keychain (e.g. a machine that only needs an unsigned dev build), or
// forced off with --no-sign. Notarization is skipped with --no-notarize,
// or automatically if the keychain profile above hasn't been set up.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { packager } = require('@electron/packager');
const pkg = require('../package.json');

const TEAM_ID = '2E2K9GSX37'; // used only in the setup message below
const SIGN_IDENTITY = 'Developer ID Application: Commotion New Media, Inc (2E2K9GSX37)';
const NOTARIZE_KEYCHAIN_PROFILE = 'NTK-notarize';
const ENTITLEMENTS = path.join(__dirname, 'entitlements.mac.plist');

// Bundled into every release zip alongside NTK.app, so someone who only
// downloaded the app still has everything needed to flash a matching
// XIAO ESP32-C6 board - see firmware/xiao-esp32c6-circuitpython-firmata/
// README.md for the full dev-facing version this is adapted from.
const FIRMWARE_SRC_DIR = path.join(__dirname, '..', 'firmware', 'xiao-esp32c6-circuitpython-firmata');
const FIRMWARE_FILES = ['code.py', 'firmata_server.py', 'pins.py', 'grove_lcd.py', 'settings.toml.example'];
const CIRCUITPYTHON_README = `# CircuitPython firmware for the Seeed XIAO ESP32-C6

Turns a Seeed XIAO ESP32-C6 into an NTK "Network" device over WiFi - no
Arduino IDE, no C++, just these files copied onto the board.

## Install

1. Install CircuitPython on the XIAO ESP32-C6 if it isn't already (see
   https://circuitpython.org/board/seeed_xiao_esp32c6/). Unlike most
   CircuitPython boards, this one doesn't mount a \`CIRCUITPY\` USB drive -
   use [Thonny](https://thonny.org/) (Tools > Options > Interpreter >
   CircuitPython, pick the board's serial port) to browse and transfer
   files on the device over its serial/REPL connection instead.
2. In Thonny's file browser, copy \`code.py\`, \`firmata_server.py\`, and
   \`pins.py\` from this folder onto the board, overwriting any existing
   \`code.py\`.
3. Copy \`settings.toml.example\` to \`settings.toml\` on the board the
   same way, and edit it there to fill in your WiFi network name and
   password.
4. The board resets and runs automatically. Watch its serial console
   (e.g. \`screen /dev/tty.usbmodem* 115200\` on macOS) for:

   \`\`\`
   Connected. IP address: 192.168.1.42
   Firmata server listening on port 3030
   \`\`\`

5. In NTK, open the **Add Widgets** panel (the "+" icon) and set its
   **Device** picker at the top to **Network**, with that IP address and
   port \`3030\` - every AnalogIn/AnalogOut/DigitalIn/DigitalOut/Servo
   widget you add from then on defaults to this board automatically, so
   you don't have to set Device/ip/port on each one individually. A
   widget already on the canvas keeps whatever Device it already had -
   change it directly in that widget's own "more" panel instead.

## SoftAP mode (no router needed)

Add \`NTK_WIFI_MODE = "ap"\` to \`settings.toml\` and the board runs its
own WiFi network instead of joining yours. It's then always at a fixed
**\`192.168.4.1\`, port \`3030\`** - no IP to read off the serial console.

\`\`\`
NTK_WIFI_MODE = "ap"
NTK_AP_SSID = "NTK-Firmata"
NTK_AP_PASSWORD = "netlabtoolkit"   # 8-63 chars; "" for an open network
\`\`\`

Join the \`NTK-Firmata\` network from your computer, then point NTK's
**Device** picker at \`192.168.4.1\` / port \`3030\`. Note: while joined to
the board's network your computer has no normal WiFi/internet, it's one
board at a time, and range is shorter than joining a real router.

If the board seems stuck on boot while starting SoftAP: there's a
4-second "press Ctrl-C now" window printed right before it starts (this
step has no built-in timeout the way joining a normal WiFi network
does), but if it's already past that and hung, only Thonny's Stop
button can force a harder interrupt.

## Optional: show the IP on a Grove LCD RGB Backlight

Wire a Grove - LCD RGB Backlight to the board's I2C pins and it'll show
the station-mode IP address (and turn the backlight green) once
connected - no serial console needed. Nothing to configure; if it isn't
attached, it's skipped silently and the board boots normally either way.

## Pin mapping

| Firmata pin | XIAO pin | Analog-capable |
|---|---|---|
| 0-5 | D0-D5 | yes (same physical pins as A0-A5) |
| 6-10 | D6-D10 | no |

If a pin doesn't behave as expected on your specific board unit, see
\`pins.py\` - it's the single table controlling what each pin claims to
support, and can be edited to match your hardware.

## Troubleshooting

- **NTK never shows "connected"**: check the IP printed on the serial
  console is still current (it can change if your router reassigns a
  lease), and that port 3030 isn't blocked by a firewall between your
  computer and the board.
- **Board prints an error and stops**: reconnect the serial console to
  see the traceback - CircuitPython prints exceptions there, including
  ones from a pin name that doesn't match your specific board (see
  \`pins.py\`).
- **Values look scaled wrong**: this reports analog values as 0-1023 and
  expects PWM writes as 0-255, matching classic Arduino - if something
  upstream assumes ESP32-native ranges (0-4095 ADC, 0-65535 PWM),
  that's the mismatch to look for.
`;

function bundleCircuitPythonFirmware(destDir) {
	fs.mkdirSync(destDir, { recursive: true });
	for (const file of FIRMWARE_FILES) {
		fs.copyFileSync(path.join(FIRMWARE_SRC_DIR, file), path.join(destDir, file));
	}
	fs.writeFileSync(path.join(destDir, 'readme.md'), CIRCUITPYTHON_README);
}

function identityIsAvailable(identity) {
	try {
		const out = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' });
		return out.includes(identity);
	} catch (err) {
		return false;
	}
}

function notarizeProfileIsAvailable(profile) {
	try {
		execFileSync('xcrun', ['notarytool', 'history', '--keychain-profile', profile], { stdio: 'ignore' });
		return true;
	} catch (err) {
		return false;
	}
}

async function main() {
	const args = process.argv.slice(2);
	const forceNoSign = args.includes('--no-sign');
	const forceNoNotarize = args.includes('--no-notarize');

	const canSign = !forceNoSign && identityIsAvailable(SIGN_IDENTITY);
	if (!forceNoSign && !canSign) {
		console.warn(`Signing identity not found in keychain ("${SIGN_IDENTITY}") - building unsigned.`);
	}

	const canNotarize = canSign && !forceNoNotarize && notarizeProfileIsAvailable(NOTARIZE_KEYCHAIN_PROFILE);
	if (canSign && !forceNoNotarize && !canNotarize) {
		console.warn(`Notarization keychain profile "${NOTARIZE_KEYCHAIN_PROFILE}" not found - skipping notarization. Run "xcrun notarytool store-credentials ${NOTARIZE_KEYCHAIN_PROFILE} --team-id ${TEAM_ID} ..." to enable it (see comments at the top of this file).`);
	}

	// electron lives in the root devDependencies, not server/'s - electron-packager
	// can't auto-detect it from the ./server source dir, so read it explicitly.
	const electronVersion = pkg.devDependencies.electron.replace(/^[^0-9]*/, '');

	const appPaths = await packager({
		dir: './server',
		name: 'NTK',
		platform: 'darwin',
		arch: 'arm64',
		electronVersion,
		overwrite: true,
		out: 'packaged',
		icon: 'server/icons/icon.icns',
		appVersion: pkg.version,
		// Top-level osxSign.entitlements/hardenedRuntime are silently ignored by
		// @electron/osx-sign (its per-file codesign pass only reads whatever
		// osxSign.optionsForFile() returns) - so entitlements must be applied
		// through that callback, not as plain osxSign properties.
		osxSign: canSign ? {
			identity: SIGN_IDENTITY,
			optionsForFile: () => ({
				entitlements: ENTITLEMENTS,
				hardenedRuntime: true,
			}),
		} : undefined,
		// Only keychainProfile (nothing else) - @electron/notarize treats the
		// presence of any password-credential field (even alongside
		// keychainProfile) as "use password credentials" and throws.
		osxNotarize: canNotarize ? {
			keychainProfile: NOTARIZE_KEYCHAIN_PROFILE,
		} : undefined,

		// Other platforms/archs, left here for reference (not currently built):
		// --platform=all --arch=arm64
		// --platform=linux --arch=arm64 --icon=server/icons/icon.icns
		// --platform=win32 --arch=x64 --icon=server/icons/icon.ico
	});

	for (const outDir of appPaths) {
		const appPath = path.join(outDir, 'NTK.app');
		console.log('Packaged:', appPath);

		// ditto's archive mode only accepts a single source path ("Can't
		// archive multiple sources"), so NTK.app and the CircuitPython
		// firmware folder are staged together under one directory first,
		// then that whole directory is zipped - rather than zipping
		// outDir itself, which would also pull in electron-packager's own
		// LICENSE/LICENSES.chromium.html/version files that were never
		// part of this zip before.
		const stageDir = path.join(path.dirname(outDir), 'NTK');
		fs.rmSync(stageDir, { recursive: true, force: true });
		fs.mkdirSync(stageDir);
		// -c (macOS-only): clonefile() on APFS, so this is an instant,
		// space-efficient reflink rather than a real duplicate copy of the
		// whole app bundle (falls back to a normal copy if that's
		// unavailable, e.g. a non-APFS destination).
		execFileSync('cp', ['-R', '-c', appPath, stageDir]);
		bundleCircuitPythonFirmware(path.join(stageDir, 'CircuitPython'));
		console.log('Bundled CircuitPython firmware:', path.join(stageDir, 'CircuitPython'));

		// Zip with ditto (not Finder/Archive Utility) so the app's
		// signature's extended attributes and resource forks survive for
		// distribution.
		const zipPath = `${outDir}.zip`;
		execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', stageDir, zipPath]);
		fs.rmSync(stageDir, { recursive: true, force: true });
		console.log('Zipped:', zipPath);
	}

	if (canSign) {
		console.log(canNotarize ? 'Signed and notarized.' : 'Signed (not notarized).');
	} else {
		console.log('Unsigned build.');
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
