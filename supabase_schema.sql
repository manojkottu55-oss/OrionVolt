-- ============================================================
-- OrionVolt — Supabase Postgres Schema
-- Run this entire file in the Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================

-- 1. KIOSKS
CREATE TABLE IF NOT EXISTS kiosks (
  kiosk_id   TEXT PRIMARY KEY,
  name       TEXT,
  location   TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'offline'
               CHECK (status IN ('online', 'offline', 'charging', 'fault')),
  last_seen  TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. PROFILES (linked to Supabase Auth users)
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  mobile_number TEXT UNIQUE,
  google_id     TEXT UNIQUE,
  name          TEXT,
  email         TEXT,
  profile_completed BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 2.5 USER VEHICLES (saved by users)
CREATE TABLE IF NOT EXISTS user_vehicles (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_type                TEXT CHECK (vehicle_type IN ('two_wheeler', 'three_wheeler', 'four_wheeler')),
  vehicle_make                TEXT,
  vehicle_model               TEXT,
  vehicle_registration_number TEXT,
  is_default                  BOOLEAN DEFAULT false,
  created_at                  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_vehicles_user_id ON user_vehicles(user_id);

-- 3. VEHICLE MASTER
CREATE TABLE IF NOT EXISTS vehicle_master (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  make                  TEXT NOT NULL,
  model                 TEXT NOT NULL,
  type                  TEXT NOT NULL CHECK (type IN ('two_wheeler', 'three_wheeler', 'four_wheeler')),
  battery_capacity_kwh  NUMERIC NOT NULL,
  nominal_voltage       NUMERIC NOT NULL,
  max_charging_current  NUMERIC NOT NULL,
  connector_type        TEXT DEFAULT 'Type 2',
  safety_limits         TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),
  UNIQUE (make, model)
);

-- 4. GUEST SESSIONS
CREATE TABLE IF NOT EXISTS guest_sessions (
  session_id         TEXT PRIMARY KEY,
  mobile_number      TEXT NOT NULL,
  kiosk_id           TEXT NOT NULL REFERENCES kiosks(kiosk_id),
  vehicle_type       TEXT CHECK (vehicle_type IN ('two_wheeler', 'three_wheeler', 'four_wheeler')),
  vehicle_id         UUID REFERENCES vehicle_master(id),
  vehicle_make       TEXT,                                   -- populated by PATCH /guest/session/:id
  vehicle_model      TEXT,                                   -- populated by PATCH /guest/session/:id
  target_type        TEXT DEFAULT 'energy'
                       CHECK (target_type IN ('duration', 'energy', 'amount', 'percentage', 'full_charge')),
  target_value       NUMERIC,
  requested_duration NUMERIC,
  requested_energy   NUMERIC,
  estimated_time_minutes NUMERIC,
  estimated_amount   NUMERIC NOT NULL,
  status             TEXT DEFAULT 'pending'
                       CHECK (status IN ('pending', 'paid', 'charging', 'completed', 'refunded', 'failed')),
  created_at         TIMESTAMPTZ DEFAULT now()
);

-- 5. SIGN-IN SESSIONS
CREATE TABLE IF NOT EXISTS signin_sessions (
  session_id         TEXT PRIMARY KEY,
  user_id            UUID NOT NULL REFERENCES auth.users(id),
  kiosk_id           TEXT NOT NULL REFERENCES kiosks(kiosk_id),
  vehicle_type       TEXT CHECK (vehicle_type IN ('two_wheeler', 'three_wheeler', 'four_wheeler')),
  vehicle_id         UUID REFERENCES vehicle_master(id),
  target_type        TEXT DEFAULT 'energy'
                       CHECK (target_type IN ('duration', 'energy', 'amount', 'percentage', 'full_charge')),
  target_value       NUMERIC,
  requested_duration NUMERIC,
  requested_energy   NUMERIC,
  estimated_time_minutes NUMERIC,
  estimated_amount   NUMERIC NOT NULL,
  status             TEXT DEFAULT 'pending'
                       CHECK (status IN ('pending', 'paid', 'charging', 'completed', 'refunded', 'failed')),
  qr_login_token     TEXT,
  created_at         TIMESTAMPTZ DEFAULT now()
);

-- 6. CHARGING SESSIONS
CREATE TABLE IF NOT EXISTS charging_sessions (
  session_id         TEXT PRIMARY KEY,
  session_type       TEXT NOT NULL CHECK (session_type IN ('guest', 'signin')),
  kiosk_id           TEXT NOT NULL REFERENCES kiosks(kiosk_id),
  start_time         TIMESTAMPTZ,
  end_time           TIMESTAMPTZ,
  energy_delivered_kwh NUMERIC DEFAULT 0,
  avg_power_kw       NUMERIC DEFAULT 0,
  duration_minutes   NUMERIC DEFAULT 0,
  amount_paid        NUMERIC DEFAULT 0,
  energy_rate_used   NUMERIC,
  starting_soc       NUMERIC,
  ending_soc         NUMERIC,
  avg_voltage        NUMERIC DEFAULT 0,
  avg_current        NUMERIC DEFAULT 0,
  status             TEXT DEFAULT 'active'
                       CHECK (status IN ('active', 'completed', 'interrupted')),
                       -- NOTE: Manual stop uses status='interrupted' + interrupted_reason='manual_stop'
                       --       Hardware faults use status='interrupted' + interrupted_reason='power_cut'|'overcurrent'
  interrupted_reason TEXT DEFAULT 'none'
                       CHECK (interrupted_reason IN ('power_cut', 'overcurrent', 'manual_stop', 'none')),
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_charging_sessions_kiosk_status ON charging_sessions(kiosk_id, status);

-- 7. PAYMENTS
CREATE TABLE IF NOT EXISTS payments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         TEXT NOT NULL,
  order_id           TEXT NOT NULL UNIQUE,
  amount             NUMERIC NOT NULL,
  gateway_order_id   TEXT,
  gateway_payment_id TEXT,
  status             TEXT DEFAULT 'created'
                       CHECK (status IN ('created', 'paid', 'failed')),
  paid_at            TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_session_id ON payments(session_id);

-- 8. REFUNDS
CREATE TABLE IF NOT EXISTS refunds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      TEXT NOT NULL,
  payment_id      UUID REFERENCES payments(id),
  amount_refunded NUMERIC NOT NULL,
  reason          TEXT NOT NULL,
  status          TEXT DEFAULT 'pending'
                    CHECK (status IN ('pending', 'processed', 'failed')),
  processed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- 9. SENSOR READINGS
CREATE TABLE IF NOT EXISTS sensor_readings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosk_id   TEXT NOT NULL,
  session_id TEXT,
  voltage    NUMERIC,
  current    NUMERIC,
  power      NUMERIC,
  timestamp  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sensor_readings_kiosk_ts ON sensor_readings(kiosk_id, timestamp DESC);

-- ============================================================
-- ROW LEVEL SECURITY
-- Enable RLS on all tables. The backend uses service_role key
-- which bypasses RLS, so these policies only restrict
-- anon/authenticated direct access.
-- ============================================================

ALTER TABLE kiosks ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE signin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE charging_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensor_readings ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read kiosks and vehicles (public data)
CREATE POLICY "kiosks_read_all" ON kiosks FOR SELECT TO authenticated USING (true);
CREATE POLICY "vehicles_read_all" ON vehicle_master FOR SELECT TO authenticated USING (true);

-- Profiles: users can only read/update their own profile
CREATE POLICY "profiles_read_own" ON profiles FOR SELECT TO authenticated
  USING (id = auth.uid());
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid());

-- User Vehicles: users can only manage their own vehicles
CREATE POLICY "user_vehicles_read_own" ON user_vehicles FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "user_vehicles_insert_own" ON user_vehicles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "user_vehicles_update_own" ON user_vehicles FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "user_vehicles_delete_own" ON user_vehicles FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Signin sessions: users can only read their own
CREATE POLICY "signin_sessions_read_own" ON signin_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Service role bypasses all RLS — no additional policies needed for backend

-- ============================================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_kiosks
  BEFORE UPDATE ON kiosks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_vehicle_master
  BEFORE UPDATE ON vehicle_master
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_charging_sessions
  BEFORE UPDATE ON charging_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- ENABLE REALTIME for tables that need live subscriptions
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'kiosks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE kiosks;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'charging_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE charging_sessions;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'sensor_readings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE sensor_readings;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'user_vehicles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE user_vehicles;
  END IF;
END $$;

-- ============================================================
-- 10. CONFIGURATION TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS tariff_config (
  id INTEGER PRIMARY KEY CHECK (id = 1), -- Single row config
  energy_rate_per_kwh NUMERIC NOT NULL DEFAULT 12,
  time_rate_per_minute NUMERIC DEFAULT 2,
  time_billing_enabled BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS grid_tariff_config (
  id INTEGER PRIMARY KEY CHECK (id = 1), -- Single row config
  buying_price_per_kwh NUMERIC NOT NULL DEFAULT 5.0,
  system_loss_percentage NUMERIC NOT NULL DEFAULT 4.2,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS for config tables
ALTER TABLE tariff_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE grid_tariff_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tariff_config_read_all" ON tariff_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "grid_tariff_config_read_all" ON grid_tariff_config FOR SELECT TO authenticated USING (true);

CREATE TRIGGER set_updated_at_tariff_config
  BEFORE UPDATE ON tariff_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_grid_tariff_config
  BEFORE UPDATE ON grid_tariff_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 11. SUPPORT TICKETS
-- ============================================================

CREATE TABLE IF NOT EXISTS support_tickets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  subject     TEXT NOT NULL,
  message     TEXT NOT NULL,
  status      TEXT DEFAULT 'open',
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Index for querying by user
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id);

-- RLS
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert their own tickets
CREATE POLICY "support_tickets_insert_own" ON support_tickets FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Allow authenticated users to read their own tickets
CREATE POLICY "support_tickets_read_own" ON support_tickets FOR SELECT TO authenticated
  USING (user_id = auth.uid());
