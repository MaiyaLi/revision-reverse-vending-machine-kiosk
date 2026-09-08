#!/bin/bash
# Start Frigate surveillance system on the kiosk Pi
set -e

cd /home/revision/frigate

# Verify camera works
echo "🔍 Verifying Pi camera..."
if ! libcamera-hello --timeout 2 >/dev/null 2>&1; then
    echo "❌ libcamera-hello failed. Ensure camera is enabled:"
    echo "   sudo raspi-config nonint do_camera 0"
    echo "   sudo reboot"
    exit 1
fi
echo "✅ Camera OK"

# Stop any old containers
docker compose down 2>/dev/null || true

# Start Frigate
echo "🚀 Starting Frigate..."
docker compose up -d

echo ""
echo "📺 Access Frigate:"
echo "   Pi:     http://localhost:5000"
echo "   Phone:  http://$(hostname -I | awk '{print $1}'):5000"
echo ""
echo "📊 View logs: docker compose logs -f frigate"
