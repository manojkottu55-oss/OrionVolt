-- ============================================================
-- SLOT BOOKING REBUILD MIGRATION
-- Run this in your Supabase SQL editor (Dashboard > SQL Editor)
-- ============================================================

-- 1. Add slot_booking_rate_per_hour to tariff_config
ALTER TABLE tariff_config
  ADD COLUMN IF NOT EXISTS slot_booking_rate_per_hour NUMERIC DEFAULT 20;

UPDATE tariff_config SET slot_booking_rate_per_hour = 20
  WHERE id = 1 AND slot_booking_rate_per_hour IS NULL;

-- 2. Extend slot_bookings table
ALTER TABLE slot_bookings
  ADD COLUMN IF NOT EXISTS vehicle_id              UUID,
  ADD COLUMN IF NOT EXISTS charging_mode           TEXT,
  ADD COLUMN IF NOT EXISTS target_energy_kwh       NUMERIC,
  ADD COLUMN IF NOT EXISTS estimated_amount        NUMERIC,
  ADD COLUMN IF NOT EXISTS estimated_soc_gain      NUMERIC,
  ADD COLUMN IF NOT EXISTS estimated_time_minutes  INTEGER,
  ADD COLUMN IF NOT EXISTS slot_duration_minutes   INTEGER,
  ADD COLUMN IF NOT EXISTS booking_fee             NUMERIC,
  ADD COLUMN IF NOT EXISTS total_payable           NUMERIC,
  ADD COLUMN IF NOT EXISTS arrival_time            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS slot_end_time           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS access_code             TEXT;

-- Convert old 'upcoming' statuses to 'cancelled' so they don't violate the new constraint
UPDATE slot_bookings SET status = 'cancelled' WHERE status = 'upcoming';

ALTER TABLE slot_bookings DROP CONSTRAINT IF EXISTS slot_bookings_status_check;
ALTER TABLE slot_bookings
  ADD CONSTRAINT slot_bookings_status_check
  CHECK (status IN (
    'pending_payment','confirmed','active_unlocked',
    'charging','completed','cancelled','no_show'
  ));

-- 3. Create slot_access_codes table
CREATE TABLE IF NOT EXISTS slot_access_codes (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   UUID        REFERENCES slot_bookings(id) ON DELETE CASCADE,
  kiosk_id     TEXT        NOT NULL,
  access_code  TEXT        NOT NULL,
  valid_from   TIMESTAMPTZ NOT NULL,
  valid_until  TIMESTAMPTZ NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'unused'
                           CHECK (status IN ('unused','used','expired')),
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_access_codes_kiosk_code
  ON slot_access_codes(kiosk_id, access_code);
CREATE INDEX IF NOT EXISTS idx_access_codes_booking_id
  ON slot_access_codes(booking_id);

ALTER TABLE slot_access_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "access_codes_read_own" ON slot_access_codes;
CREATE POLICY "access_codes_read_own" ON slot_access_codes
  FOR SELECT TO authenticated
  USING (booking_id IN (SELECT id FROM slot_bookings WHERE user_id = auth.uid()));

-- 4. Enable Realtime for slot_bookings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'slot_bookings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE slot_bookings;
  END IF;
END $$;
