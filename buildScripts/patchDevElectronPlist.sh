#!/bin/bash
# Dev only. `npm run electron` runs against node_modules/electron's stock
# Info.plist, which has NSMicrophoneUsageDescription / NSCameraUsageDescription
# but NOT NSSpeechRecognitionUsageDescription - so the SpeechIn widget's
# Apple Speech helper can't get speech-recognition permission when spawned
# in dev (a packaged build gets it via packageElectron.js's extendInfo).
# This adds the missing key so `npm run electron` can exercise SpeechIn.
# Harmless / idempotent; re-run after `npm install` reinstalls electron.
set -e

[ "$(uname)" = "Darwin" ] || exit 0

PLIST="$(cd "$(dirname "$0")/.." && pwd)/node_modules/electron/dist/Electron.app/Contents/Info.plist"
[ -f "$PLIST" ] || exit 0

if /usr/libexec/PlistBuddy -c "Print :NSSpeechRecognitionUsageDescription" "$PLIST" >/dev/null 2>&1; then
	exit 0
fi

/usr/libexec/PlistBuddy -c "Add :NSSpeechRecognitionUsageDescription string 'NTK (dev) uses speech recognition for the SpeechIn widget.'" "$PLIST"
echo "patchDevElectronPlist: added NSSpeechRecognitionUsageDescription to dev electron"
