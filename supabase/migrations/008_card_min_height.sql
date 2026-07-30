-- DML Score — merchant-configurable minimum height for the score tool card.
-- Run against the DEDICATED DML Score Supabase project only.

ALTER TABLE score_settings
  ADD COLUMN IF NOT EXISTS card_min_height INTEGER NOT NULL DEFAULT 560;
