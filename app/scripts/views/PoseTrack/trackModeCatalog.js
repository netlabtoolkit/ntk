define([], function() {
    'use strict';

    /**
     * Client-side catalog of tracking modes for the PoseTrack widget -
     * hand-kept in sync with which MediaPipe Tasks-Vision landmarker/
     * model each mode actually needs. Both HandLandmarker and
     * PoseLandmarker expose the exact same result shape
     * (`result.landmarks[0]` = an array of {x,y,z} points for the first
     * detected hand/body, both normalized 0-1 in image space), so
     * PoseTrack.js's detection/feature-extraction code is entirely
     * generic across modes - only this catalog differs.
     *
     * originIndices/scaleReferenceIndices: landmark indices averaged
     * together to build the reference point/distance a captured pose is
     * normalized against (translate to origin, scale by the reference
     * distance) so the same pose reads consistently regardless of the
     * subject's size/distance from the camera. Both are arrays (even
     * when just one index) so PoseTrack.js's normalization code doesn't
     * need to special-case "one landmark" vs "midpoint of several".
     */
    return {
        hand: {
            label: 'Hand',
            landmarkerClass: 'HandLandmarker',
            modelPath: '/assets/mediapipe/models/hand_landmarker.task',
            // Property name on the options object passed to
            // createFromOptions() that limits how many hands/bodies to
            // detect at once - this widget only ever uses the first one.
            countOptionKey: 'numHands',
            landmarkCount: 21,
            // Landmark 0 = wrist (MediaPipe's Hand landmark model).
            originIndices: [0],
            // Landmark 9 = middle finger MCP (base knuckle) - a stable
            // reference distance from the wrist regardless of which
            // fingers are extended in a given pose.
            scaleReferenceIndices: [9],
            // [from, to] landmark index pairs - MediaPipe's standard
            // HAND_CONNECTIONS, used to draw a recognizable skeleton
            // (not just a cloud of dots) for a recorded slot's preview
            // (see PoseTrack.js's drawSlotPreview) and the live overlay.
            connections: [
                [0, 1], [1, 2], [2, 3], [3, 4],
                [0, 5], [5, 6], [6, 7], [7, 8],
                [5, 9], [9, 10], [10, 11], [11, 12],
                [9, 13], [13, 14], [14, 15], [15, 16],
                [13, 17], [17, 18], [18, 19], [19, 20],
                [0, 17],
            ],
        },
        body: {
            label: 'Body',
            landmarkerClass: 'PoseLandmarker',
            modelPath: '/assets/mediapipe/models/pose_landmarker_lite.task',
            countOptionKey: 'numPoses',
            landmarkCount: 33,
            // Landmarks 11/12 = left/right shoulder (MediaPipe's Pose
            // landmark model) - their midpoint as the origin stays
            // stable across most poses even when limbs move a lot.
            originIndices: [11, 12],
            // Landmarks 23/24 = left/right hip - shoulder-to-hip
            // distance is a reasonable proxy for torso size/distance
            // from camera, sturdier than shoulder-width alone against
            // rotation.
            scaleReferenceIndices: [23, 24],
            // A simplified subset of MediaPipe's official POSE_CONNECTIONS
            // - just the main torso/limb skeleton (shoulders, arms, hips,
            // legs), leaving out the face landmarks' connections, which
            // only add clutter at the small size this draws at and aren't
            // the focus of a "body pose".
            connections: [
                [11, 12],
                [11, 13], [13, 15],
                [12, 14], [14, 16],
                [11, 23], [12, 24],
                [23, 24],
                [23, 25], [25, 27],
                [24, 26], [26, 28],
            ],
        },
    };
});
