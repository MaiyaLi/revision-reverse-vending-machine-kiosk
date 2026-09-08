#!/bin/bash
# Frigate Setup Script for ReVision RVM Kiosk
# Sets up Docker, Frigate, and the RTSP stream proxy

set -e

echo "=========================================="
echo "  ReVision Kiosk - Frigate Surveillance Setup"
echo "=========================================="

# 1. Enable Pi Camera
echo ""
echo "📷 Enabling Pi Camera Interface..."
sudo raspi-config nonint do_camera 0

# 2. Verify camera (may fail on some Pi versions - non-fatal)
echo ""
echo "🔍 Checking camera..."
sudo vcgencmd get_camera 2>/dev/null || echo "⚠️ vcgencmd not available (may be Pi OS Bookworm+) - skipping"
ls /dev/video* /dev/media* 2>/dev/null || echo "⚠️ No camera devices found"

# 3. Install Docker
echo ""
echo "🐳 Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker $USER
    echo "⚠️  Please logout and login again, or run: newgrp docker"
else
    echo "✅ Docker already installed: $(docker --version)"
fi

# 4. Install Docker Compose
echo ""
echo "📦 Installing Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    sudo apt-get update
    sudo apt-get install -y docker-compose
else
    echo "✅ Docker Compose already installed"
fi

# 5. Create directory structure
echo ""
echo "📁 Creating directories..."
mkdir -p /home/revision/frigate/config
mkdir -p /home/revision/frigate/recordings
mkdir -p /home/revision/frigate/clips

# 6. Start Frigate
echo ""
echo "🚀 Starting Frigate..."
cd /home/revision/frigate
docker-compose up -d

echo ""
echo "=========================================="
echo "  Frigate is starting..."
echo "  - Web UI:      http://`hostname -I | awk '{print $1}'`:5000"
echo "  - Camera feed: CSI-0 (surveillance)"
echo "  - Access from phone: http://$(hostname -I | awk '{print $1}'):5000"
echo "=========================================="
echo ""
echo "📺 To view from the kiosk:"
echo "   - Click 'Surveillance Camera' button on Learn More screen"
echo ""
echo "📱 To view from phone:"
echo "   - Open browser to http://$(hostname -I | awk '{print $1}'):5000"
