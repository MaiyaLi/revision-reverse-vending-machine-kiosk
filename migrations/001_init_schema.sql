-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id VARCHAR(20) UNIQUE NOT NULL,
  qr_code_id VARCHAR(50) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  mobile_number VARCHAR(20) UNIQUE,
  pin_hash VARCHAR(255) NOT NULL,
  email_address VARCHAR(255),
  age INT,
  barangay VARCHAR(100),
  profile_photo_url TEXT,
  wallet_balance DECIMAL(10, 2) DEFAULT 0.00,
  total_lifetime_earnings DECIMAL(12, 2) DEFAULT 0.00,
  eco_points INT DEFAULT 0,
  co2_reduction_kg DECIMAL(8, 3) DEFAULT 0.000,
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP,
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_users_member_id ON users(member_id);
CREATE INDEX IF NOT EXISTS idx_users_mobile ON users(mobile_number);

-- Deposit sessions table
CREATE TABLE IF NOT EXISTS deposit_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  session_ref_id VARCHAR(50) UNIQUE NOT NULL,
  status VARCHAR(50) DEFAULT 'IN_PROGRESS',
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  total_items_count INT DEFAULT 0,
  accepted_items_count INT DEFAULT 0,
  rejected_items_count INT DEFAULT 0,
  total_weight_grams INT DEFAULT 0,
  total_payout DECIMAL(10, 2) DEFAULT 0.00,
  total_eco_points INT DEFAULT 0,
  total_co2_reduction_kg DECIMAL(8, 3) DEFAULT 0.000
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON deposit_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_ref_id ON deposit_sessions(session_ref_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON deposit_sessions(status);

-- Deposited items table
CREATE TABLE IF NOT EXISTS deposited_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES deposit_sessions(id),
  item_number INT NOT NULL,
  detected_material VARCHAR(50) NOT NULL,
  item_name VARCHAR(255),
  weight_grams INT,
  payout_amount DECIMAL(6, 2),
  eco_points INT,
  co2_reduction_kg DECIMAL(5, 3),
  status VARCHAR(50) DEFAULT 'ACCEPTED',
  image_capture_url TEXT,
  inductive_sensor_reading BOOLEAN,
  load_cell_reading_grams INT,
  tof_distance_mm INT,
  classification_confidence DECIMAL(3, 2),
  processed_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (session_id, item_number)
);

CREATE INDEX IF NOT EXISTS idx_items_session_id ON deposited_items(session_id);

-- Payout transactions table
CREATE TABLE IF NOT EXISTS payout_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  external_id VARCHAR(100) UNIQUE NOT NULL,
  xendit_id VARCHAR(100),
  session_id UUID NOT NULL REFERENCES deposit_sessions(id),
  user_id UUID REFERENCES users(id),
  amount DECIMAL(10, 2) NOT NULL,
  channel VARCHAR(50) NOT NULL,
  account_number VARCHAR(50),
  account_name VARCHAR(255),
  payout_url TEXT,
  status VARCHAR(50) DEFAULT 'PENDING',
  failure_reason TEXT,
  failure_code VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payouts_user_id ON payout_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_payouts_session_id ON payout_transactions(session_id);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON payout_transactions(status);
CREATE INDEX IF NOT EXISTS idx_payouts_external_id ON payout_transactions(external_id);

-- Transaction history table
CREATE TABLE IF NOT EXISTS transaction_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  payout_id UUID REFERENCES payout_transactions(id),
  type VARCHAR(50) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  balance_before DECIMAL(10, 2),
  balance_after DECIMAL(10, 2),
  details TEXT,
  eco_points_gained INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_history_user_id ON transaction_history(user_id);
CREATE INDEX IF NOT EXISTS idx_history_type ON transaction_history(type);
CREATE INDEX IF NOT EXISTS idx_history_created_at ON transaction_history(created_at);

-- Receipt table
CREATE TABLE IF NOT EXISTS receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id VARCHAR(50) UNIQUE NOT NULL,
  session_id UUID NOT NULL REFERENCES deposit_sessions(id),
  user_id UUID REFERENCES users(id),
  materials_deposited VARCHAR(255),
  total_weight_kg DECIMAL(6, 3),
  total_reward DECIMAL(10, 2),
  payout_method VARCHAR(100),
  payout_status VARCHAR(50),
  printed_at TIMESTAMP,
  printed_count INT DEFAULT 0,
  email_sent_at TIMESTAMP,
  sms_sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_receipts_transaction_id ON receipts(transaction_id);
CREATE INDEX IF NOT EXISTS idx_receipts_session_id ON receipts(session_id);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100),
  entity_id VARCHAR(100),
  user_id UUID REFERENCES users(id),
  action VARCHAR(50),
  old_values JSONB,
  new_values JSONB,
  ip_address VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_event_type ON audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_log(created_at);

-- Dispenser inventory
CREATE TABLE IF NOT EXISTS dispenser_inventory (
  id BIGSERIAL PRIMARY KEY,
  machine_id VARCHAR(50) NOT NULL,
  coins_10_pesos INT DEFAULT 0,
  coins_5_pesos INT DEFAULT 0,
  coins_1_peso INT DEFAULT 0,
  last_refilled TIMESTAMP,
  refill_count INT DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (machine_id)
);

-- Bin capacity tracking
CREATE TABLE IF NOT EXISTS bin_inventory (
  id BIGSERIAL PRIMARY KEY,
  machine_id VARCHAR(50) NOT NULL,
  material_type VARCHAR(50) NOT NULL,
  current_count INT DEFAULT 0,
  max_capacity INT,
  last_emptied TIMESTAMP,
  empty_count INT DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (machine_id, material_type)
);
