-- DML Score — dedicated background art for the winner-reveal screen.
-- Run against the DEDICATED DML Score Supabase project only.
-- Empty string = falls back to the standard "bg" background.

ALTER TABLE score_settings
  ADD COLUMN IF NOT EXISTS image_bg_winner TEXT NOT NULL DEFAULT '';
