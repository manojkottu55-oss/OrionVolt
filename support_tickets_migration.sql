-- ============================================================
-- Support Tickets Admin Migration
-- Run in Supabase SQL Editor
-- Safe to re-run
-- ============================================================

-- Add admin_notes and updated_at if missing
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS admin_notes TEXT;

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Admin service role can read/update all tickets (service role bypasses RLS)
-- but add an explicit admin policy for authenticated admins if needed

-- Allow service role to read/update all tickets
-- (Service role already bypasses RLS — no policy needed for backend service role)

-- Ensure the updated_at trigger exists for this table
CREATE OR REPLACE FUNCTION update_support_tickets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_support_tickets_updated_at ON support_tickets;

CREATE TRIGGER set_support_tickets_updated_at
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_support_tickets_updated_at();
