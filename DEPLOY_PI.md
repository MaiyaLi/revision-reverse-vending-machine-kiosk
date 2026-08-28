# ReVision RVM Kiosk - Raspberry Pi 5 Deployment Guide

This guide will walk you through deploying the ReVision Reverse Vending Machine Kiosk on a Raspberry Pi 5 to test bottle classification with the camera.

## Prerequisites

- Raspberry Pi 5 (4GB or 8GB RAM recommended)
- Raspberry Pi OS (64-bit) or Ubuntu Server 64-bit
- USB webcam or Raspberry Pi Camera Module
- Internet connection (for Gemini AI API calls)
- PostgreSQL database (can be local or remote)

## Step 1: Push to GitHub

```bash
# On your local machine (Windows)
cd C:\Users\rimur\Downloads\revision-reverse-vending-machine-kiosk

# Initialize git if not already done
git init
git add .
git commit -m "Initial commit"

# Add your GitHub remote
git remote add origin https://github.com/YOUR_USERNAME/revision-reverse-vending-machine-kiosk.git
git branch -M main
git push -u origin main
```

## Step 2: Prepare Raspberry Pi 5

### 2.1 Update System

```bash
sudo apt update && sudo apt upgrade -y
```

### 2.2 Install Node.js 20+ (64-bit)

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version  # Should be v22.x or higher
```

### 2.3 Install PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

### 2.4 Set up PostgreSQL

```bash
# Switch to postgres user
sudo -u postgres psql

# In PostgreSQL shell:
CREATE DATABASE revision_rvm;
CREATE USER revision_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE revision_rvm TO revision_user;
\q
```

### 2.5 Install Git

```bash
sudo apt install -y git
```

## Step 3: Clone and Configure

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/revision-reverse-vending-machine-kiosk.git
cd revision-reverse-vending-machine-kiosk

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Copy environment file
cp .env.example .env

# Edit .env with your values
nano .env
```

### Required `.env` values:

```env
# Gemini AI API Key (get from https://aistudio.google.com/app/apikey)
GEMINI_API_KEY="your_actual_gemini_api_key"

# PostgreSQL connection
DATABASE_URL="postgresql://revision_user:your_password@localhost:5432/revision_rvm"

# Xendit (optional, for payout testing)
XENDIT_SECRET_KEY=""
XENDIT_WEBHOOK_TOKEN=""

# Server config
NODE_ENV="production"
PORT="3000"
APP_URL="http://localhost:3000"
```

## Step 4: Initialize Database

```bash
# Run Prisma migrations
npx prisma migrate dev --name init

# Or if migrations already exist, deploy them:
npx prisma migrate deploy

# Seed test data (optional)
npx tsx src/scripts/seed.ts
```

## Step 5: Build for Production

```bash
npm run build
```

## Step 6: Run the Application

### Option A: Production mode

```bash
npm run start
```

### Option B: Development mode (for testing)

```bash
npm run dev
```

## Step 7: Access the Kiosk

Open a browser on the Raspberry Pi (or remotely) and go to:

```
http://localhost:3000
```

Or from another device on the same network:

```
http://<raspberry-pi-ip>:3000
```

## Camera Setup

### USB Webcam

Most USB webcams work out of the box on Raspberry Pi OS:

```bash
# Test your webcam
sudo apt install -y fswebcam
fswebcam -r 640x480 --jpeg 85 -D 1 test.jpg
```

### Raspberry Pi Camera Module

If using the official Raspberry Pi Camera Module:

```bash
# Enable camera interface
sudo raspi-config nonint do_camera 0
sudo reboot
```

## Testing Bottle Classification

1. Open the kiosk UI in a browser
2. Click anywhere to start
3. Select "Insert Materials" → "Guest Mode"
4. Set quantities and click "Start Deposit Scan"
5. Allow camera access when prompted
6. Hold a bottle/can in front of the camera
7. The system will capture the image and send it to Gemini AI for classification
8. Results show detected material, confidence, and reward value

## Important Notes

- **Internet required**: Gemini AI classification requires an internet connection
- **Camera permissions**: The browser must have camera access permissions
- **PostgreSQL optional**: The server runs in demo mode without PostgreSQL (no persistent data)
- **Display**: For kiosk mode, connect a touchscreen monitor to the Pi's HDMI port

## Troubleshooting

### Camera not working
- Ensure the browser has camera permissions
- For USB webcams, check `lsusb` to verify detection
- For Pi Camera Module, run `vcgencmd get_camera` to verify

### Port already in use
```bash
# Change PORT in .env or kill the process
sudo lsof -i :3000
sudo kill -9 <PID>
```

### PostgreSQL connection issues
```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql

# Verify credentials
sudo -u postgres psql -c "SELECT 1;"
```

### Build fails on ARM
```bash
# Ensure you're on 64-bit OS
uname -m  # Should show aarch64

# Clear and reinstall
rm -rf node_modules dist
npm install
npm run build
```
