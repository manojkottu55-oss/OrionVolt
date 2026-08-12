-- ============================================================
-- 11. SLOT BOOKINGS
-- ============================================================

CREATE TABLE IF NOT EXISTS slot_bookings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name        TEXT,
  user_mobile      TEXT,
  kiosk_id         TEXT REFERENCES kiosks(kiosk_id),
  kiosk_location   TEXT,
  vehicle_model    TEXT,
  booking_date     DATE,
  booking_time     TIME,
  duration_minutes INTEGER,
  status           TEXT DEFAULT 'upcoming'
                     CHECK (status IN ('upcoming', 'completed', 'cancelled', 'no_show')),
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE slot_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "slot_bookings_read_own" ON slot_bookings FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "slot_bookings_insert_own" ON slot_bookings FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "slot_bookings_update_own" ON slot_bookings FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER set_updated_at_slot_bookings
  BEFORE UPDATE ON slot_bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
