# ReVision Reverse Vending Machine Kiosk

IoT-Enabled Reverse Vending Machine Kiosk Application with Automated Material Sorting, Gemini Vision Detection, and Real-time Reward Balance Management.

## Features

- **Bottle Classification**: Uses Gemini AI Vision to classify plastic bottles, aluminum cans, and glass bottles
- **User Accounts**: Persistent user accounts with wallet balance, eco-points, and transaction history
- **Admin Dashboard**: Admin endpoints to view all users and global statistics
- **Mobile App Ready**: REST API designed for future mobile app integration
- **Receipt Generation**: SMS, Email, and Print receipt support
- **Payout Integration**: GCash, Maya, QRPh, and Cash dispenser support via Xendit

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 14+
- Gemini API Key ([Get one here](https://aistudio.google.com/app/apikey))

### Installation

```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Copy environment file
cp .env.example .env

# Edit .env with your configuration
nano .env
```

### Database Setup

```bash
# Run migrations
npx prisma migrate dev --name init

# Seed test data (optional)
npx tsx src/scripts/seed.ts
```

### Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for Production

```bash
npm run build
npm run start
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GEMINI_API_KEY` | Google Gemini AI API key for bottle classification | Yes |
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `XENDIT_SECRET_KEY` | Xendit API key for payouts | No |
| `XENDIT_WEBHOOK_TOKEN` | Webhook verification token | No |
| `PORT` | Server port (default: 3000) | No |
| `NODE_ENV` | Environment (development/production) | No |

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login with credential and PIN

### User Profile
- `GET /api/user/:memberId` - Get user profile with stats
- `GET /api/user/:memberId/profile` - Get minimal user profile
- `GET /api/user/:memberId/stats` - Get user statistics
- `PUT /api/user/:memberId` - Update user profile
- `POST /api/user/:memberId/update-pin` - Update PIN code
- `POST /api/user/:memberId/deactivate` - Deactivate account
- `POST /api/user/:memberId/reactivate` - Reactivate account

### User History
- `GET /api/user/:memberId/history` - Get transaction history
- `GET /api/user/:memberId/deposits` - Get deposit history

### Admin
- `GET /api/admin/users` - List all users
- `GET /api/admin/users/:memberId` - Get specific user details
- `GET /api/admin/stats` - Get global statistics

### Deposits
- `POST /api/deposit/session/start` - Start deposit session
- `POST /api/deposit/item/add` - Add item to session
- `POST /api/deposit/complete` - Complete deposit session
- `GET /api/deposit/session/:sessionRefId` - Get session details

### Payouts
- `POST /api/payout/direct` - Create direct disbursement
- `POST /api/payout/link` - Create payout link
- `POST /api/payout/cash` - Record cash dispense
- `GET /api/payout/status/:externalId` - Check payout status

### Redemption
- `POST /api/redemption/withdraw` - Withdraw from wallet

### Waste Detection
- `POST /api/detect-waste` - Classify bottle/can via Gemini AI

### Receipts
- `POST /api/receipt/create` - Create receipt
- `GET /api/receipt/:transactionId` - Get receipt
- `POST /api/receipt/print/:transactionId` - Print receipt
- `POST /api/receipt/sms/:transactionId` - Send SMS receipt
- `POST /api/receipt/email/:transactionId` - Send email receipt

### Health
- `GET /api/health` - Server health check
- `GET /api/user/health/check` - User service health

## Database Schema

The application uses PostgreSQL with the following main models:

- **User** - Account information, wallet balance, eco points
- **DepositSession** - Recycling session tracking
- **DepositItem** - Individual items deposited
- **TransactionHistory** - All financial transactions
- **PayoutTransaction** - Payout records
- **Receipt** - Receipt records
- **AuditLog** - System audit trail

## Deployment

See [DEPLOY_PI.md](./DEPLOY_PI.md) for Raspberry Pi 5 deployment instructions.

## Tech Stack

- **Frontend**: React 19, Tailwind CSS 4, Vite 6
- **Backend**: Express, Node.js
- **Database**: PostgreSQL with Prisma ORM
- **AI**: Google Gemini 2.0 Flash
- **Payments**: Xendit API
