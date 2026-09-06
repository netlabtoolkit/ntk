#!/bin/bash
# Compiles the SpeechIn / SpeechOut Apple helpers (macOS only). No-op with
# a warning on non-macOS - those widgets fall back to the browser APIs
# there (SpeechIn to "not available", SpeechOut to window.speechSynthesis).
set -e

DIR="$(cd "$(dirname "$0")/../server/speechHelper" && pwd)"

if [ "$(uname)" != "Darwin" ]; then
	echo "buildSpeechHelper: not macOS, skipping"
	exit 0
fi

if ! command -v swiftc >/dev/null 2>&1; then
	echo "buildSpeechHelper: swiftc not found (install Xcode command line tools) - skipping"
	exit 0
fi

# speechhelper (SpeechIn): -sectcreate embeds Info.plist so TCC can read
# the mic / speech-recognition usage strings for this bare CLI.
swiftc -O "$DIR/speechhelper.swift" -o "$DIR/speechhelper" \
	-Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker "$DIR/Info.plist"
echo "buildSpeechHelper: built $DIR/speechhelper"

# ttshelper (SpeechOut): output-only, no mic, no TCC prompt - no plist.
swiftc -O "$DIR/ttshelper.swift" -o "$DIR/ttshelper"
echo "buildSpeechHelper: built $DIR/ttshelper"
