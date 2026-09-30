#!/bin/bash

# Copies MediaPipe's Tasks-Vision WASM runtime (from the
# @mediapipe/tasks-vision devDependency, fetched by `npm install`) and
# downloads the .task model files this app's widgets load at runtime -
# FaceTrack.js (face_landmarker), PoseRecog.js (hand_landmarker,
# pose_landmarker_lite) - into server/assets/mediapipe/ (served at
# /assets - see server/modules/nlWebServer/routes.js). All fetched once
# here rather than committed to git or fetched from Google's CDN at
# runtime, matching how bower_components are fetched-not-vendored. The
# WASM runtime/vision_bundle.mjs is shared across every one of these
# tasks - fetched once regardless of how many widgets use it.

set -e

DEST=./server/assets/mediapipe
SRC=./node_modules/@mediapipe/tasks-vision

mkdir -p "$DEST/wasm" "$DEST/models"

cp "$SRC/vision_bundle.mjs" "$DEST/vision_bundle.mjs"
cp "$SRC"/wasm/*.js "$SRC"/wasm/*.wasm "$DEST/wasm/"

fetch_model() {
	local dest_file="$1"
	local url="$2"
	if [ ! -f "$dest_file" ]; then
		curl -L -o "$dest_file" "$url"
	fi
}

fetch_model "$DEST/models/face_landmarker.task" \
	"https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"

# PoseRecog.js's two tracking modes (see trackModeCatalog.js) - hand
# uses the numbered/float16 naming FaceTrack's model also uses; pose
# uses Google's "lite" variant (smaller/faster, traded accuracy this
# app's real-time in-browser use case doesn't need) and "latest"
# instead of a pinned version number, matching Google's own official
# examples for this specific model.
fetch_model "$DEST/models/hand_landmarker.task" \
	"https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
fetch_model "$DEST/models/pose_landmarker_lite.task" \
	"https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"

# ObjectRecog.js - EfficientDet-Lite0 object detector (80 COCO classes,
# used for the live label outlet + to crop the embedding to the detected
# object) and the MobileNet-V3-small image embedder (the per-frame
# feature vector its 1-NN classifier matches against recorded examples).
# Both are .tflite (not .task) - MediaPipe's ObjectDetector/ImageEmbedder
# take raw TFLite models. Same shared vision_bundle.mjs/wasm runtime as
# above, zero added WASM weight.
fetch_model "$DEST/models/efficientdet_lite0.tflite" \
	"https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float32/latest/efficientdet_lite0.tflite"
fetch_model "$DEST/models/mobilenet_v3_small.tflite" \
	"https://storage.googleapis.com/mediapipe-models/image_embedder/mobilenet_v3_small/float32/1/mobilenet_v3_small.tflite"

echo "MediaPipe assets ready in $DEST"
