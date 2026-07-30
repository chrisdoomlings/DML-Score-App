-- DML Score — merchant-configurable home/winner screen logo width.
-- Run against the DEDICATED DML Score Supabase project only.

ALTER TABLE score_settings
  ADD COLUMN IF NOT EXISTS logo_width INTEGER NOT NULL DEFAULT 220;
