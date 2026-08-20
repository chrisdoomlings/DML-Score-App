-- DML Score — layout controls for the welcome screen's character illustration
-- and heading, admin-editable like the rest of the home screen sizing knobs
-- (logo_width, card_min_height, winner_image_size in 001/005/009).
-- Run against the DEDICATED DML Score Supabase project only.

ALTER TABLE score_settings
  ADD COLUMN IF NOT EXISTS characters_width    INTEGER NOT NULL DEFAULT 320,
  ADD COLUMN IF NOT EXISTS heading_width       INTEGER NOT NULL DEFAULT 320,
  ADD COLUMN IF NOT EXISTS heading_font_size   INTEGER NOT NULL DEFAULT 32;
