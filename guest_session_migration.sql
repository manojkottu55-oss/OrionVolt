-- ============================================================
-- OrionVolt — Guest Sessions Schema Migration
-- Adds vehicle_make and vehicle_model columns to guest_sessions.
-- These are populated in PATCH /api/guest/session/:sessionId
-- when the kiosk user selects their vehicle from the display.
--
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

ALTER TABLE guest_sessions
  ADD COLUMN IF NOT EXISTS vehicle_make  TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_model TEXT;

-- Verify
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'guest_sessions'
-- ORDER BY ordinal_position;
