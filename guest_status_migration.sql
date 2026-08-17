-- ============================================================
-- OrionVolt — Guest Sessions: Add 'calculated' status
-- Adds 'calculated' to the guest_sessions.status CHECK constraint
-- so PATCH /api/guest/session/:id can advance status after
-- vehicle + charging mode selection.
--
-- Run in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Drop the existing CHECK constraint on status
ALTER TABLE guest_sessions DROP CONSTRAINT IF EXISTS guest_sessions_status_check;

-- Re-add it with 'calculated' included
ALTER TABLE guest_sessions ADD CONSTRAINT guest_sessions_status_check
  CHECK (status IN ('pending', 'calculated', 'paid', 'charging', 'completed', 'refunded', 'failed'));

-- Verify
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'guest_sessions'::regclass AND conname LIKE '%status%';
