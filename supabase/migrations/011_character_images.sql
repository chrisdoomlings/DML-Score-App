-- DML Score — welcome-screen bee/fish Doomling character art, split into
-- normal + hover states so each can animate independently (continuous bob,
-- staggered pop-in) in a later frontend pass. Prep-only migration: this adds
-- storage, the animation itself is built separately.
-- Run against the DEDICATED DML Score Supabase project only.
-- Empty string = falls back to the bundled default asset (same convention as
-- the other image_* columns from 003_custom_images.sql).

ALTER TABLE score_settings
  ADD COLUMN IF NOT EXISTS image_bee_normal  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_bee_hover   TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_fish_normal TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_fish_hover  TEXT NOT NULL DEFAULT '';
