-- ============================================================
-- OrionVolt — Mock Data Cleanup Migration
-- Deletes all test/mock session data created with hardcoded
-- kiosk_id 'KSK001' (which doesn't match the real ESP32 kiosk 'KS001').
-- 
-- SAFE TO RUN: Only deletes session/payment/refund/sensor rows.
-- Does NOT touch: kiosks, profiles, user_vehicles, vehicle_master.
-- 
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- STEP 1: Delete refunds linked to any existing session
-- (Must delete before payments and charging_sessions due to FK refs)
-- ─────────────────────────────────────────────────────────────
DELETE FROM refunds
WHERE session_id IN (
  SELECT session_id FROM charging_sessions
)
OR session_id IN (
  SELECT session_id FROM signin_sessions
)
OR session_id IN (
  SELECT session_id FROM guest_sessions
);

-- ─────────────────────────────────────────────────────────────
-- STEP 2: Delete all payments linked to any session
-- ─────────────────────────────────────────────────────────────
DELETE FROM payments
WHERE session_id IN (
  SELECT session_id FROM charging_sessions
)
OR session_id IN (
  SELECT session_id FROM signin_sessions
)
OR session_id IN (
  SELECT session_id FROM guest_sessions
);

-- ─────────────────────────────────────────────────────────────
-- STEP 3: Delete all sensor readings (all linked to sessions)
-- ─────────────────────────────────────────────────────────────
DELETE FROM sensor_readings
WHERE session_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- STEP 4: Delete all charging_sessions (the main mock records)
-- ─────────────────────────────────────────────────────────────
DELETE FROM charging_sessions;

-- ─────────────────────────────────────────────────────────────
-- STEP 5: Delete all signin_sessions (these drove the mock data)
-- ─────────────────────────────────────────────────────────────
DELETE FROM signin_sessions;

-- ─────────────────────────────────────────────────────────────
-- STEP 6: Delete all guest_sessions
-- ─────────────────────────────────────────────────────────────
DELETE FROM guest_sessions;

-- ─────────────────────────────────────────────────────────────
-- STEP 7 (TASK 4): Verify/upsert the real kiosk row for KS001
-- This ensures the physical ESP32 prototype's kiosk record exists.
-- We do NOT delete any kiosk rows.
-- ─────────────────────────────────────────────────────────────
INSERT INTO kiosks (kiosk_id, name, location, status)
VALUES (
  'KS001',
  'OrionVolt Prototype Kiosk',
  'Test Location — OrionVolt HQ',
  'offline'
)
ON CONFLICT (kiosk_id) DO UPDATE
  SET name       = COALESCE(kiosks.name, EXCLUDED.name),
      location   = COALESCE(kiosks.location, EXCLUDED.location),
      updated_at = now();
-- NOTE: status is NOT overwritten — the real ESP32 telemetry controls it.
-- This upsert only ensures the row exists without overriding live data.

-- ─────────────────────────────────────────────────────────────
-- VERIFICATION: Run these SELECT statements after the above
-- to confirm clean state. Expected: all 0 rows except kiosks.
-- ─────────────────────────────────────────────────────────────
-- SELECT COUNT(*) AS charging_sessions_count FROM charging_sessions;
-- SELECT COUNT(*) AS signin_sessions_count    FROM signin_sessions;
-- SELECT COUNT(*) AS guest_sessions_count     FROM guest_sessions;
-- SELECT COUNT(*) AS payments_count           FROM payments;
-- SELECT COUNT(*) AS refunds_count            FROM refunds;
-- SELECT COUNT(*) AS sensor_readings_count    FROM sensor_readings;
-- SELECT kiosk_id, name, location, status, last_seen FROM kiosks;
