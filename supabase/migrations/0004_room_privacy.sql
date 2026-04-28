-- Phase 4.8 — public vs private rooms.
-- Adds rooms.is_public; updates the public-directory partial index to
-- exclude private rooms. Existing rows are public by default (matches
-- pre-migration behaviour where every titled room showed up in /rooms).

ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT TRUE;

DROP INDEX IF EXISTS idx_rooms_public_directory;
DROP INDEX IF EXISTS idx_rooms_public_active_recent;

CREATE INDEX IF NOT EXISTS idx_rooms_public_active_recent
  ON rooms (is_active, last_active_at DESC)
  WHERE title IS NOT NULL AND is_public = TRUE;
