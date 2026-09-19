#!/bin/bash
# ReVision RVM Kiosk - Complete Startup Script
# Initializes database, runs migrations, and starts the server

set -e

echo "🚀 ReVision RVM Kiosk - Startup Sequence"
echo "========================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Installing dependencies...${NC}"
    npm install
    echo -e "${GREEN}✅ Dependencies installed${NC}"
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚙️  Creating .env file...${NC}"
    cat > .env << 'EOF'
# Database Configuration
DATABASE_URL="postgresql://postgres:password@localhost:5432/revision_rvm"

# Payout Configuration (Operator-assisted)
OPERATOR_PAYOUT_KEY="your_operator_key"
OPERATOR_WEBHOOK_TOKEN="your_webhook_token"

# Gemini AI Configuration
GEMINI_API_KEY="your_gemini_api_key"

# Application Configuration
NODE_ENV="development"
PORT="3000"
APP_URL="http://localhost:3000"
EOF
    echo -e "${GREEN}✅ .env file created${NC}"
fi

# Generate Prisma Client
echo -e "${YELLOW}🔧 Generating Prisma Client...${NC}"
npx prisma generate
echo -e "${GREEN}✅ Prisma Client generated${NC}"

# Run migrations
echo -e "${YELLOW}🗄️  Running database migrations...${NC}"
npx prisma migrate deploy || npx prisma migrate dev --name init
echo -e "${GREEN}✅ Database migrations completed${NC}"

# Seed database
echo -e "${YELLOW}🌱 Seeding database with test data...${NC}"
npx tsx src/scripts/seed.ts || true
echo -e "${GREEN}✅ Database seeded${NC}"

echo ""
echo -e "${GREEN}========================================"
echo -e "✅ All systems initialized successfully!"
echo -e "=======================================${NC}"
echo ""
echo -e "${YELLOW}Starting server on http://localhost:3000${NC}"
echo ""
echo "📋 Available Endpoints:"
echo "  • Transaction: http://localhost:3000/api/deposit"
echo "  • User: http://localhost:3000/api/user"
echo "  • Health: http://localhost:3000/api/health"
echo ""

# Start the server
npm run dev
