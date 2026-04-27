-- Phase 4.5 — user-created public rooms.
-- Adds an optional title + creator_id to `rooms`. When `title IS NOT NULL`
-- the row is a user-created public room and shows up in the /rooms
-- directory; when NULL it's an auto-created city room (the existing
-- behaviour from Phase 3). No data backfill needed — existing city rooms
-- stay title-less.

ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS creator_id UUID REFERENCES signups(id);

-- Partial index keeps the directory query fast even as rooms table grows.
CREATE INDEX IF NOT EXISTS idx_rooms_public_directory
  ON rooms (is_active, created_at DESC)
  WHERE title IS NOT NULL;

-- Optional: a CHECK to keep titles sane (non-empty, capped length).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rooms_title_length_check'
  ) THEN
    ALTER TABLE rooms
      ADD CONSTRAINT rooms_title_length_check
      CHECK (title IS NULL OR (char_length(trim(title)) BETWEEN 1 AND 80));
  END IF;
END$$;
