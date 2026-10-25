#!/usr/bin/env bash
# Copy MediaPipe wasm from node_modules and download the Pose Landmarker model (not committed: large binaries).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p web/public/mediapipe web/public/models
cp node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_module_internal.* web/public/mediapipe/
cp node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.* web/public/mediapipe/
cp node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_nosimd_internal.* web/public/mediapipe/
M=web/public/models/pose_landmarker_lite.task
[ -s "$M" ] || curl -sSfL -o "$M" https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task
