#!/bin/bash
# Start rpicam-vid as a UDP H264 stream for Frigate to consume
# This runs on the Pi HOST and sends to 127.0.0.1:8554

set -e

echo "📹 Starting CSI-0 surveillance camera stream (UDP 127.0.0.1:8554)..."

# Kill any existing rpicam-vid
pkill -f "rpicam-vid" 2>/dev/null || true

# Stream H264 over UDP to go2rtc (inside Frigate container on host network)
rpicam-vid \
  -t 0 \
  --inline \
  --width 640 \
  --height 480 \
  --framerate 15 \
  --codec h264 \
  -o udp://127.0.0.1:8554

echo "Stream started. Press Ctrl+C to stop."
