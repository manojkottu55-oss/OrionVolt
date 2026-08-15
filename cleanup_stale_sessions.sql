-- ============================================================
-- OrionVolt — Clean up stale active charging sessions for KS001
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- STEP 1: Inspect — see all active sessions currently stuck
SELECT session_id, kiosk_id, start_time, status, energy_delivered_kwh
FROM charging_sessions
WHERE status = 'active'
ORDER BY kiosk_id, start_time DESC;

-- STEP 2: Close all stale active sessions except the newest per kiosk.
-- This sets them to 'interrupted' with reason 'manual_stop' (both are valid
-- allowed values in the CHECK constraint).
UPDATE charging_sessions
SET
  status             = 'interrupted',
  interrupted_reason = 'manual_stop',
  end_time           = now()
WHERE status = 'active'
  AND session_id NOT IN (
    -- Keep only the newest active session per kiosk
    SELECT DISTINCT ON (kiosk_id) session_id
    FROM charging_sessions
    WHERE status = 'active'
    ORDER BY kiosk_id, start_time DESC
  );

-- STEP 3: Verify — should show at most 1 active row per kiosk after cleanup
SELECT kiosk_id, count(*) AS active_count
FROM charging_sessions
WHERE status = 'active'
GROUP BY kiosk_id;

-- STEP 4 (OPTIONAL but recommended): Add a partial unique index to Postgres
-- so that only ONE active session per kiosk is ever allowed at the DB level.
-- This prevents the duplicate-active-session problem from ever occurring again.
--
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_per_kiosk
--   ON charging_sessions (kiosk_id)
--   WHERE status = 'active';
--
-- Uncomment and run the CREATE INDEX above AFTER Step 2 has cleaned up all duplicates.
-- Running it with duplicates still present will fail.
