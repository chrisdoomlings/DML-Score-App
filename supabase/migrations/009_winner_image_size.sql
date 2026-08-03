-- DML Score — merchant-configurable size for the winner reveal art.
-- Run against the DEDICATED DML Score Supabase project only.

ALTER TABLE score_settings
  ADD COLUMN IF NOT EXISTS winner_image_size INTEGER NOT NULL DEFAULT 260;
