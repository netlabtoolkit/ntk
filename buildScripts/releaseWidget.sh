#!/bin/sh
# Shows how far an NTK release build has got in a Terminal Widget
# (https://terminalwidget.app) desktop widget. Does nothing when Terminal
# Widget isn't installed, so it's always safe to call.
#
# Usage: buildScripts/releaseWidget.sh STEP
#   STEP is one of the release stages, in order:
#     version  build  mac  windows  firmware  tag  github  website  done
#   or "failed" to turn the widget red at the step it reached.
#
# Each call shows the step about to run, the bar filled up to it, the
# version from package.json and the minutes since "version".
#
# In Terminal Widget, add a widget and set its Target to "ntk-release"
# (or set NTK_RELEASE_WIDGET to another name).

TW="$(command -v terminal-widget 2>/dev/null)"
[ -z "$TW" ] && TW=/Applications/TerminalWidget.app/Contents/MacOS/TerminalWidget
[ -x "$TW" ] || exit 0

TARGET="${NTK_RELEASE_WIDGET:-ntk-release}"
STATE="${TMPDIR:-/tmp}/ntk-release-widget"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(node -p "require('$ROOT/package.json').version" 2>/dev/null)"

# step number (of 8), what's happening now
case "$1" in
	version)  n=0; label="Bumping version" ;;
	build)    n=1; label="Building (npm run build)" ;;
	mac)      n=2; label="Mac app: package, sign, notarize" ;;
	windows)  n=3; label="Windows zip" ;;
	firmware) n=4; label="Checking CircuitPython files" ;;
	tag)      n=5; label="Merging, tagging, pushing" ;;
	github)   n=6; label="GitHub release" ;;
	website)  n=7; label="Uploading to netlabtoolkit.org" ;;
	done)     n=8; label="Released" ;;
	failed)   n=""; label="Failed" ;;
	*) echo "usage: $0 version|build|mac|windows|firmware|tag|github|website|done|failed" >&2; exit 1 ;;
esac

now=$(date +%s)
if [ "$1" = version ] || [ ! -f "$STATE" ]; then
	echo "$now 0" > "$STATE"
fi
read -r started last < "$STATE"
[ -z "$n" ] && n="$last"
echo "$started $n" > "$STATE"

minutes=$(( (now - started) / 60 ))
percent=$(( n * 100 / 8 ))
text="$(printf 'NTK %s\n%s\n%s min' "$VERSION" "$label" "$minutes")"

case "$1" in
	done)   color="#22c55e"; icon="checkmark.seal.fill" ;;
	failed) color="#ef4444"; icon="xmark.octagon.fill" ;;
	*)      color="#38bdf8"; icon="hammer.fill" ;;
esac

"$TW" --target "$TARGET" --text "$text" --icon "$icon" --fg "$color" \
	--progress "$percent" --progress-format bar --caption >/dev/null 2>&1 || true
exit 0
