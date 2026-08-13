-- ============================================================
-- Support Tickets Migration
-- Run in Supabase SQL Editor
-- Safe to re-run (uses IF NOT EXISTS / DROP IF EXISTS patterns)
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

DO $$ BEGIN
  DROP POLICY IF EXISTS "support_tickets_insert_own" ON support_tickets;
  DROP POLICY IF EXISTS "support_tickets_read_own" ON support_tickets;
END $$;

-- Allow authenticated users to insert their own tickets
CREATE POLICY "support_tickets_insert_own" ON support_tickets FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Allow authenticated users to read their own tickets
CREATE POLICY "support_tickets_read_own" ON support_tickets FOR SELECT TO authenticated
  USING (user_id = auth.uid());
