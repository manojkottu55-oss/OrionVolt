-- Add estimated_time_minutes to both session tables
ALTER TABLE signin_sessions ADD COLUMN IF NOT EXISTS estimated_time_minutes NUMERIC DEFAULT 0;
ALTER TABLE guest_sessions ADD COLUMN IF NOT EXISTS estimated_time_minutes NUMERIC DEFAULT 0;
