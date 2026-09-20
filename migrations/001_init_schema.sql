-- Enable UUID extension (used by baseline/Prisma; app generates UUIDs as TEXT)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ENUM TYPES
-- ============================================

CREATE TYPE IF NOT EXISTS "DepositStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED', 'FAILED');
CREATE TYPE IF NOT EXISTS "ItemStatus" AS ENUM ('ACCEPTED', 'REJECTED', 'PENDING');
CREATE TYPE IF NOT EXISTS "TransactionType" AS ENUM ('DEPOSIT', 'REDEMPTION', 'REFUND', 'BONUS');
CREATE TYPE IF NOT EXISTS "PayoutChannel" AS ENUM ('GCASH', 'MAYA', 'QRPH', 'CASH', 'WALLET');
CREATE TYPE IF NOT EXISTS "PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REJECTED');
CREATE TYPE IF NOT EXISTS "OperatorPayoutStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id TEXT NOT NULL,
    "memberId" VARCHAR(50) NOT NULL,
    "qrCodeId" VARCHAR(50) NOT NULL,
    "fullName" VARCHAR(255) NOT NULL,
    "phoneNumber" VARCHAR(20),
    "emailAddress" VARCHAR(255),
    "age" INTEGER,
    "barangay" VARCHAR(100),
    "profilePhotoUrl" TEXT,
    "walletBalance" REAL NOT NULL DEFAULT 0.0,
    "totalLifetimeEarnings" REAL NOT NULL DEFAULT 0.0,
    "ecoPoints" INTEGER NOT NULL DEFAULT 0,
    "co2ReducedKg" REAL NOT NULL DEFAULT 0.0,
    "pinCodeHash" VARCHAR(255),
    "lastLoginAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_memberId_key" ON users("memberId");
CREATE UNIQUE INDEX IF NOT EXISTS "users_qrCodeId_key" ON users("qrCodeId");
CREATE UNIQUE INDEX IF NOT EXISTS "users_phoneNumber_key" ON users("phoneNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "users_emailAddress_key" ON users("emailAddress");

CREATE INDEX IF NOT EXISTS "users_memberId_idx" ON users("memberId");
CREATE INDEX IF NOT EXISTS "users_phoneNumber_idx" ON users("phoneNumber");
CREATE INDEX IF NOT EXISTS "users_createdAt_idx" ON users("createdAt");
CREATE INDEX IF NOT EXISTS "users_isActive_idx" ON users("isActive");

-- ============================================
-- DEPOSIT SESSIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS deposit_sessions (
    id TEXT NOT NULL,
    "userId" TEXT,
    "sessionRefId" VARCHAR(100) NOT NULL,
    status "DepositStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "totalItemsCount" INTEGER NOT NULL DEFAULT 0,
    "acceptedItemsCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedItemsCount" INTEGER NOT NULL DEFAULT 0,
    "totalWeightGrams" INTEGER NOT NULL DEFAULT 0,
    "totalPayout" REAL NOT NULL DEFAULT 0.0,
    "totalEcoPoints" INTEGER NOT NULL DEFAULT 0,
    "totalCo2ReductionKg" REAL NOT NULL DEFAULT 0.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposit_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "deposit_sessions_sessionRefId_key" ON deposit_sessions("sessionRefId");
CREATE INDEX IF NOT EXISTS "deposit_sessions_userId_idx" ON deposit_sessions("userId");
CREATE INDEX IF NOT EXISTS "deposit_sessions_sessionRefId_idx" ON deposit_sessions("sessionRefId");
CREATE INDEX IF NOT EXISTS "deposit_sessions_status_idx" ON deposit_sessions("status");
CREATE INDEX IF NOT EXISTS "deposit_sessions_createdAt_idx" ON deposit_sessions("createdAt");

-- ============================================
-- DEPOSITED ITEMS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS deposited_items (
    id TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "itemNumber" INTEGER NOT NULL,
    "detectedMaterial" VARCHAR(50) NOT NULL,
    "itemName" VARCHAR(255) NOT NULL,
    "weightGrams" INTEGER NOT NULL,
    "payoutAmount" REAL NOT NULL,
    "ecoPoints" INTEGER NOT NULL,
    "co2ReductionKg" REAL NOT NULL,
    status "ItemStatus" NOT NULL DEFAULT 'ACCEPTED',
    "confidence" REAL,
    "imageCaptureUrl" TEXT,
    "inductiveSensorReading" BOOLEAN,
    "loadCellReadingGrams" INTEGER,
    "tofDistanceMm" INTEGER,
    "classificationConfidence" DOUBLE PRECISION,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposited_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "deposited_items_sessionId_idx" ON deposited_items("sessionId");
CREATE INDEX IF NOT EXISTS "deposited_items_detectedMaterial_idx" ON deposited_items("detectedMaterial");
CREATE UNIQUE INDEX IF NOT EXISTS "deposited_items_sessionId_itemNumber_key" ON deposited_items("sessionId", "itemNumber");

-- ============================================
-- DETECTION HISTORY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS detection_history (
    id TEXT NOT NULL,
    "detectedMaterial" VARCHAR(50) NOT NULL,
    "itemName" VARCHAR(255),
    "confidence" REAL,
    "estimatedWeightGrams" INTEGER,
    "co2ReductionKg" REAL,
    "ecoPoints" INTEGER,
    "payoutAmount" REAL,
    "imageBase64" TEXT,
    "boundingBox" JSONB,
    "imageWidth" INTEGER,
    "imageHeight" INTEGER,
    "status" "ItemStatus" NOT NULL DEFAULT 'ACCEPTED',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "detection_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "detection_history_timestamp_idx" ON detection_history("timestamp");

-- ============================================
-- RATE LIMITS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS rate_limits (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "resetTime" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("key")
);

-- ============================================
-- TRANSACTION HISTORY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS transaction_history (
    id TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "payoutId" TEXT,
    type "TransactionType" NOT NULL,
    amount REAL NOT NULL,
    "balanceBefore" REAL,
    "balanceAfter" REAL,
    details TEXT,
    "ecoPointsGained" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "transaction_history_userId_idx" ON transaction_history("userId");
CREATE INDEX IF NOT EXISTS "transaction_history_type_idx" ON transaction_history("type");
CREATE INDEX IF NOT EXISTS "transaction_history_createdAt_idx" ON transaction_history("createdAt");

-- ============================================
-- PAYOUT TRANSACTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS payout_transactions (
    id TEXT NOT NULL,
    "externalId" VARCHAR(100) NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    amount REAL NOT NULL,
    channel "PayoutChannel" NOT NULL,
    "accountNumber" VARCHAR(50),
    "accountName" VARCHAR(255),
    "payoutUrl" TEXT,
    status "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "failureCode" VARCHAR(100),
    "failureReason" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payout_transactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "payout_transactions_externalId_key" ON payout_transactions("externalId");
CREATE INDEX IF NOT EXISTS "payout_transactions_userId_idx" ON payout_transactions("userId");
CREATE INDEX IF NOT EXISTS "payout_transactions_sessionId_idx" ON payout_transactions("sessionId");
CREATE INDEX IF NOT EXISTS "payout_transactions_status_idx" ON payout_transactions("status");
CREATE INDEX IF NOT EXISTS "payout_transactions_externalId_idx" ON payout_transactions("externalId");

-- ============================================
-- OPERATOR PAYOUT REQUESTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS operator_payout_requests (
    id TEXT NOT NULL,
    "referenceId" VARCHAR(100) NOT NULL,
    "sessionId" TEXT,
    "userId" TEXT,
    amount REAL NOT NULL,
    channel "PayoutChannel" NOT NULL,
    "recipientPhone" VARCHAR(50) NOT NULL,
    "recipientName" VARCHAR(255) NOT NULL,
    status "OperatorPayoutStatus" NOT NULL DEFAULT 'PENDING',
    "operatorNote" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operator_payout_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "operator_payout_requests_userId_idx" ON operator_payout_requests("userId");
CREATE INDEX IF NOT EXISTS "operator_payout_requests_sessionId_idx" ON operator_payout_requests("sessionId");
CREATE INDEX IF NOT EXISTS "operator_payout_requests_status_idx" ON operator_payout_requests("status");
CREATE UNIQUE INDEX IF NOT EXISTS "operator_payout_requests_referenceId_key" ON operator_payout_requests("referenceId");
CREATE INDEX IF NOT EXISTS "operator_payout_requests_expiresAt_idx" ON operator_payout_requests("expiresAt");

-- ============================================
-- RECEIPTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS receipts (
    id TEXT NOT NULL,
    "transactionId" VARCHAR(50) NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "materialsDeposited" VARCHAR(255),
    "totalWeightKg" DOUBLE PRECISION,
    "totalReward" DOUBLE PRECISION,
    "payoutMethod" VARCHAR(100),
    "payoutStatus" VARCHAR(50),
    "printedAt" TIMESTAMP(3),
    "printedCount" INTEGER NOT NULL DEFAULT 0,
    "emailSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "receipts_transactionId_key" ON receipts("transactionId");
CREATE INDEX IF NOT EXISTS "receipts_transactionId_idx" ON receipts("transactionId");
CREATE INDEX IF NOT EXISTS "receipts_sessionId_idx" ON receipts("sessionId");

-- ============================================
-- AUDIT LOG TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL NOT NULL,
    "userId" TEXT,
    "eventType" VARCHAR(100) NOT NULL,
    "entityType" VARCHAR(100),
    "entityId" VARCHAR(100),
    "action" VARCHAR(50),
    "oldValues" JSONB,
    "newValues" JSONB,
    "ipAddress" VARCHAR(50),
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "audit_log_userId_idx" ON audit_log("userId");
CREATE INDEX IF NOT EXISTS "audit_log_eventType_idx" ON audit_log("eventType");
CREATE INDEX IF NOT EXISTS "audit_log_createdAt_idx" ON audit_log("createdAt");

-- ============================================
-- DISPENSOR INVENTORY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS dispenser_inventory (
    id BIGSERIAL NOT NULL,
    "machineId" VARCHAR(50) NOT NULL,
    "coins10Pesos" INTEGER NOT NULL DEFAULT 0,
    "coins5Pesos" INTEGER NOT NULL DEFAULT 0,
    "coins1Peso" INTEGER NOT NULL DEFAULT 0,
    "lastRefilled" TIMESTAMP(3),
    "refillCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispenser_inventory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "dispenser_inventory_machineId_key" ON dispenser_inventory("machineId");

-- ============================================
-- BIN INVENTORY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS bin_inventory (
    id BIGSERIAL NOT NULL,
    "machineId" VARCHAR(50) NOT NULL,
    "materialType" VARCHAR(50) NOT NULL,
    "currentCount" INTEGER NOT NULL DEFAULT 0,
    "maxCapacity" INTEGER,
    "lastEmptied" TIMESTAMP(3),
    "emptyCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bin_inventory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "bin_inventory_machineId_materialType_key" ON bin_inventory("machineId", "materialType");

-- ============================================
-- FOREIGN KEYS
-- ============================================

ALTER TABLE deposit_sessions
    ADD CONSTRAINT IF NOT EXISTS "deposit_sessions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES users("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE deposited_items
    ADD CONSTRAINT IF NOT EXISTS "deposited_items_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES deposit_sessions("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE transaction_history
    ADD CONSTRAINT IF NOT EXISTS "transaction_history_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES users("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE transaction_history
    ADD CONSTRAINT IF NOT EXISTS "transaction_history_payoutId_fkey"
    FOREIGN KEY ("payoutId") REFERENCES payout_transactions("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE payout_transactions
    ADD CONSTRAINT IF NOT EXISTS "payout_transactions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES users("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE payout_transactions
    ADD CONSTRAINT IF NOT EXISTS "payout_transactions_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES deposit_sessions("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE operator_payout_requests
    ADD CONSTRAINT IF NOT EXISTS "operator_payout_requests_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES users("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE operator_payout_requests
    ADD CONSTRAINT IF NOT EXISTS "operator_payout_requests_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES deposit_sessions("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE receipts
    ADD CONSTRAINT IF NOT EXISTS "receipts_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES deposit_sessions("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE receipts
    ADD CONSTRAINT IF NOT EXISTS "receipts_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES users("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE audit_log
    ADD CONSTRAINT IF NOT EXISTS "audit_log_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES users("id") ON DELETE SET NULL ON UPDATE CASCADE;
