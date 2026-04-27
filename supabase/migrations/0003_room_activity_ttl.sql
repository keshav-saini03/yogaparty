-- Phase 4.7 — public-room activity TTL.
-- Adds last_active_at to rooms. The /rooms directory hides public rooms
-- whose last_active_at is older than ~3 min (effectively "no one's there").
-- last-leaver soft-delete (is_active=false) is a backup, gated on >90s of
-- inactivity to avoid racing the leave event.
--
-- Auto-created city rooms (title IS NULL) are exempt from cleanup —
-- they're long-lived and recreated on demand by findOrCreateCityRoom.

ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_rooms_public_active_recent
  ON rooms (is_active, last_active_at DESC)
  WHERE title IS NOT NULL;
