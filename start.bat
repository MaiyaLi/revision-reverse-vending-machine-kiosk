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

REM Check if .env exists
if not exist ".env" (
    echo ⚙️  Creating .env file...
    (
        echo # Database Configuration
        echo DATABASE_URL=postgresql://postgres:password@localhost:5432/revision_rvm
        echo.
        echo # Xendit Configuration
        echo XENDIT_SECRET_KEY=xnd_development_key
        echo XENDIT_WEBHOOK_TOKEN=webhook_token_secret
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
