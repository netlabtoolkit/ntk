#!/bin/bash
# Compiles the SpeechIn widget's Apple Speech helper (macOS only).
# No-op with a warning on non-macOS - the SpeechIn widget just reports
# "not available" there (whisper.cpp is the deferred cross-platform path,
# see plans/ / the speech-to-text memory note).
set -e

DIR="$(cd "$(dirname "$0")/../server/speechHelper" && pwd)"

if [ "$(uname)" != "Darwin" ]; then
	echo "buildSpeechHelper: not macOS, skipping (SpeechIn will report 'not available')"
	exit 0
fi

if ! command -v swiftc >/dev/null 2>&1; then
	echo "buildSpeechHelper: swiftc not found (install Xcode command line tools) - skipping"
	exit 0
fi

# -sectcreate embeds Info.plist into the Mach-O so TCC can read the
# NS*UsageDescription strings for this bare CLI (no .app bundle).
swiftc -O "$DIR/speechhelper.swift" -o "$DIR/speechhelper" \
	-Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker "$DIR/Info.plist"

echo "buildSpeechHelper: built $DIR/speechhelper"
