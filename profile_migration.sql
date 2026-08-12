-- ============================================================
-- Profile & User Vehicles Migration
-- Run in Supabase SQL Editor
-- Safe to re-run (uses IF NOT EXISTS / DROP IF EXISTS patterns)
-- ============================================================

-- 1. Add profile_completed column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT false;

-- 2. Create user_vehicles table
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

-- 3. RLS for user_vehicles
ALTER TABLE user_vehicles ENABLE ROW LEVEL SECURITY;

-- Drop policies if they already exist (safe re-run)
DO $$ BEGIN
  DROP POLICY IF EXISTS "user_vehicles_read_own" ON user_vehicles;
  DROP POLICY IF EXISTS "user_vehicles_insert_own" ON user_vehicles;
  DROP POLICY IF EXISTS "user_vehicles_update_own" ON user_vehicles;
  DROP POLICY IF EXISTS "user_vehicles_delete_own" ON user_vehicles;
END $$;

CREATE POLICY "user_vehicles_read_own" ON user_vehicles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "user_vehicles_insert_own" ON user_vehicles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_vehicles_update_own" ON user_vehicles FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "user_vehicles_delete_own" ON user_vehicles FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- 4. Realtime for user_vehicles
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

-- 5. Also ensure profiles has update policy for authenticated users
DO $$ BEGIN
  DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
END $$;

CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
