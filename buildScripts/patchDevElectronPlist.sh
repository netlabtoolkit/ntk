#!/bin/bash
# Dev only. `npm run electron` runs against node_modules/electron's stock
# Info.plist, which has NSMicrophoneUsageDescription / NSCameraUsageDescription
# but NOT NSSpeechRecognitionUsageDescription - so the SpeechIn widget's
# Apple Speech helper can't get speech-recognition permission when spawned
# in dev (a packaged build gets it via packageElectron.js's extendInfo).
# This adds the missing key so `npm run electron` can exercise SpeechIn.
#
# Also rewrites CFBundleIdentifier away from Electron's stock
# "com.github.Electron" and re-signs the app ad-hoc. That identifier is
# shared by basically every unpackaged Electron dev tool on a machine
# (not just this repo's), so macOS TCC's per-app grants (Local Network,
# camera, mic, speech recognition) get conflated across all of them -
# root-caused 2026-09-24 via NTK dev intermittently failing to reach a
# real network device (EHOSTUNREACH) with "Electron" simply absent from
# System Settings > Privacy & Security > Local Network, while the
# separately-identified packaged build (com.electron.ntk) connected
# fine. Giving dev its own stable identity (com.commotion.ntk-dev, distinct
# from the packaged app's com.electron.ntk) isolates its permission
# grants going forward - changing Info.plist invalidates the existing
# ad-hoc signature, so it must be re-signed after, or macOS treats the
# bundle as tampered.
#
# Harmless / idempotent; re-run after `npm install` reinstalls electron
# (which resets both the plist and the signature back to stock).
set -e

[ "$(uname)" = "Darwin" ] || exit 0

APP="$(cd "$(dirname "$0")/.." && pwd)/node_modules/electron/dist/Electron.app"
PLIST="$APP/Contents/Info.plist"
[ -f "$PLIST" ] || exit 0

DEV_BUNDLE_ID="com.commotion.ntk-dev"
NEEDS_RESIGN=0

if /usr/libexec/PlistBuddy -c "Print :NSSpeechRecognitionUsageDescription" "$PLIST" >/dev/null 2>&1; then
	: # already patched
else
	/usr/libexec/PlistBuddy -c "Add :NSSpeechRecognitionUsageDescription string 'NTK (dev) uses speech recognition for the SpeechIn widget.'" "$PLIST"
	echo "patchDevElectronPlist: added NSSpeechRecognitionUsageDescription to dev electron"
	NEEDS_RESIGN=1
fi

# Without this key, macOS doesn't just skip the Local Network prompt -
# it appears to silently block the connection with NO prompt and NO
# error, hanging forever (found 2026-09-24 right after giving dev its
# own CFBundleIdentifier above: a brand-new identity with no prior
# grant and no usage-description string never got a dialog at all,
# unlike the packaged build, which likely predates this enforcement
# getting stricter). NSBonjourServices is deliberately NOT added here -
# this connects to a plain IP:port, not via .local mDNS resolution, so
# it isn't needed for this path.
if /usr/libexec/PlistBuddy -c "Print :NSLocalNetworkUsageDescription" "$PLIST" >/dev/null 2>&1; then
	: # already patched
else
	/usr/libexec/PlistBuddy -c "Add :NSLocalNetworkUsageDescription string 'NTK (dev) connects to CircuitPython/Firmata devices on your local network.'" "$PLIST"
	echo "patchDevElectronPlist: added NSLocalNetworkUsageDescription to dev electron"
	NEEDS_RESIGN=1
fi

CURRENT_BUNDLE_ID="$(/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "$PLIST" 2>/dev/null || true)"
if [ "$CURRENT_BUNDLE_ID" != "$DEV_BUNDLE_ID" ]; then
	/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier $DEV_BUNDLE_ID" "$PLIST"
	/usr/libexec/PlistBuddy -c "Set :CFBundleName NTK (dev)" "$PLIST" 2>/dev/null \
		|| /usr/libexec/PlistBuddy -c "Add :CFBundleName string 'NTK (dev)'" "$PLIST"
	echo "patchDevElectronPlist: set CFBundleIdentifier to $DEV_BUNDLE_ID"
	NEEDS_RESIGN=1
fi

# Prefer the real Developer ID cert packageElectron.js already signs
# release builds with, over an ad-hoc (-) signature - found 2026-09-24:
# an ad-hoc-signed dev binary given its own CFBundleIdentifier got no
# interactive Local Network prompt at all on first launch (not even a
# denial dialog), then consistently failed to reach a real network
# device (EHOSTUNREACH) on every later attempt, while the properly
# Developer-ID-signed packaged build connected every time under
# identical network conditions - strongly suggesting macOS won't grant
# this TCC permission interactively to an ad-hoc-signed binary at all,
# silently denying it instead. Checked independently of NEEDS_RESIGN
# above (not just folded into it) because the signing identity itself
# can change (e.g. this script's own code changing which cert it
# prefers) without any plist content changing, which the plist-diffing
# checks above can't detect on their own.
SIGN_IDENTITY="Developer ID Application: Commotion New Media, Inc (2E2K9GSX37)"
CURRENT_SIGNER="$(codesign -dvv "$APP" 2>&1 | sed -n 's/^Authority=//p' | head -1)"
if security find-identity -v -p codesigning 2>/dev/null | grep -q "$SIGN_IDENTITY"; then
	if [ "$CURRENT_SIGNER" != "$SIGN_IDENTITY" ]; then
		NEEDS_RESIGN=1
	fi
	if [ "$NEEDS_RESIGN" = "1" ]; then
		codesign --force --deep --sign "$SIGN_IDENTITY" "$APP" >/dev/null 2>&1
		echo "patchDevElectronPlist: re-signed dev electron with Developer ID"
	fi
else
	# Falls back to ad-hoc if the cert isn't present on this machine
	# (e.g. a different dev machine without it installed) - camera/mic/
	# speech-recognition dev testing still works either way, only Local
	# Network access is known to need the real identity.
	if [ "$NEEDS_RESIGN" = "1" ]; then
		codesign --force --deep --sign - "$APP" >/dev/null 2>&1
		echo "patchDevElectronPlist: re-signed dev electron ad-hoc (Developer ID cert not found on this machine)"
	fi
fi
