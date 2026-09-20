@echo off
REM ReVision RVM Kiosk - Windows Startup Script
REM Initializes database, runs migrations, and starts the server

setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo ========================================
echo 🚀 ReVision RVM Kiosk - Startup Sequence
echo ========================================
echo.

REM Check if node_modules exists
if not exist "node_modules\" (
    echo 📦 Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo ❌ Failed to install dependencies
        exit /b 1
    )
    echo ✅ Dependencies installed
)

if not defined PYTHON_BIN set PYTHON_BIN=python
where "%PYTHON_BIN%" >nul 2>nul
if errorlevel 1 (
    echo ❌ Python 3 is required for local YOLO detection
    exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
    echo 🐍 Creating Python virtual environment...
    "%PYTHON_BIN%" -m venv ".venv"
)

echo 🐍 Installing vision dependencies...
call ".venv\Scripts\python.exe" -m pip install --upgrade pip
call ".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 (
    echo ❌ Failed to install vision dependencies
    exit /b 1
)

if not exist "models" mkdir "models"
if not exist "models\yolov8n.pt" (
    echo 🐍 Downloading YOLOv8n model...
    call ".venv\Scripts\python.exe" -c "from ultralytics import YOLO; YOLO('models\yolov8n.pt')"
    if exist "yolov8n.pt" move /Y "yolov8n.pt" "models\yolov8n.pt"
)

if not exist "models\yolov8n.pt" (
    echo ❌ Vision model setup failed
    exit /b 1
)
echo ✅ Vision environment ready

REM Check if .env exists
if not exist ".env" (
    echo ⚙️  Creating .env file...
    (
        echo # Database Configuration
        echo DATABASE_URL=postgresql://postgres:password@localhost:5432/revision_rvm
        echo.
        echo # Payout Configuration (Operator-assisted)
        echo OPERATOR_PAYOUT_KEY=your_operator_key
        echo OPERATOR_WEBHOOK_TOKEN=your_webhook_token
        echo.
        echo # Gemini AI Configuration
        echo GEMINI_API_KEY=your_gemini_api_key
        echo.
        echo # Application Configuration
        echo NODE_ENV=development
        echo PORT=3000
        echo APP_URL=http://localhost:3000
    ) > .env
    echo ✅ .env file created
)

REM Generate Prisma Client
echo 🔧 Generating Prisma Client...
call npx prisma generate
if errorlevel 1 (
    echo ❌ Failed to generate Prisma Client
    exit /b 1
)
echo ✅ Prisma Client generated

REM Run migrations
echo 🗄️  Running database migrations...
call npx prisma migrate deploy
if errorlevel 1 (
    echo ℹ️  Running initial migration...
    call npx prisma migrate dev --name init
)
echo ✅ Database migrations completed

REM Seed database
echo 🌱 Seeding database with test data...
call npx tsx src/scripts/seed.ts
if errorlevel 1 (
    echo ⚠️  Database seeding optional
)
echo ✅ Database seeded

echo.
echo ========================================
echo ✅ All systems initialized successfully!
echo ========================================
echo.
echo 🌐 Starting server on http://localhost:3000
echo.
echo 📋 Available Endpoints:
echo    • Transaction: http://localhost:3000/api/deposit
echo    • User: http://localhost:3000/api/user
echo    • Health: http://localhost:3000/api/health
echo.

REM Start the server
call npm run dev

pause
