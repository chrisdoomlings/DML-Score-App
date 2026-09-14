-- DML Score — split each step's single "character image" slot into
-- independent left/right images so they can fly in from their own screen
-- edge (previously one combined graphic — both characters baked into one
-- upload — slid in as a unit, from whichever side matched the Back/Next
-- nav direction; see dmls-score.js/renderStep()).
-- The old image_bg_we/fv/bp/exp columns are left in place (unused, not
-- dropped) rather than migrated — same convention as the guess-game
-- columns from 010_achievements.sql. Admin re-uploads fresh left/right art
-- per step; the old combined image doesn't carry over automatically.
-- Run against the DEDICATED DML Score Supabase project only.

ALTER TABLE score_settings
  ADD COLUMN IF NOT EXISTS image_bg_we_left    TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_bg_we_right   TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_bg_fv_left    TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_bg_fv_right   TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_bg_bp_left    TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_bg_bp_right   TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_bg_exp_left   TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_bg_exp_right  TEXT NOT NULL DEFAULT '';
