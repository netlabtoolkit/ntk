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

const path = require('path');
const { execFileSync } = require('child_process');
const { packager } = require('@electron/packager');
const pkg = require('../package.json');

const TEAM_ID = '2E2K9GSX37'; // used only in the setup message below
const SIGN_IDENTITY = 'Developer ID Application: Commotion New Media, Inc (2E2K9GSX37)';
const NOTARIZE_KEYCHAIN_PROFILE = 'NTK-notarize';
const ENTITLEMENTS = path.join(__dirname, 'entitlements.mac.plist');

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
		// packager() returns the containing output directory, not the .app
		// bundle itself - zip the bundle so it's the top-level entry.
		const appPath = path.join(outDir, 'NTK.app');
		console.log('Packaged:', appPath);

		// Zip with ditto (not Finder/Archive Utility) so the signature's
		// extended attributes and resource forks survive for distribution.
		const zipPath = `${outDir}.zip`;
		execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', appPath, zipPath]);
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
