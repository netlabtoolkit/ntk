#!/bin/bash

# Copies the MediaPipe Face Landmarker's WASM runtime (from the
# @mediapipe/tasks-vision devDependency, fetched by `npm install`) and
# downloads its .task model file into server/assets/mediapipe/, where
# FaceTrack.js loads them from at runtime (server/assets is served at
# /assets - see server/modules/nlWebServer/routes.js). Both are fetched
# once here rather than committed to git or fetched from Google's CDN at
# runtime, matching how bower_components are fetched-not-vendored.

set -e

DEST=./server/assets/mediapipe
SRC=./node_modules/@mediapipe/tasks-vision

mkdir -p "$DEST/wasm" "$DEST/models"

cp "$SRC/vision_bundle.mjs" "$DEST/vision_bundle.mjs"
cp "$SRC"/wasm/*.js "$SRC"/wasm/*.wasm "$DEST/wasm/"

MODEL="$DEST/models/face_landmarker.task"
if [ ! -f "$MODEL" ]; then
	curl -L -o "$MODEL" \
		"https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
fi

echo "MediaPipe assets ready in $DEST"
