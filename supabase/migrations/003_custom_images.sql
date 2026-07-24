-- DML Score — admin-replaceable art assets
-- Run against the DEDICATED DML Score Supabase project only.
-- Empty string means "use the bundled default asset shipped with the extension."

ALTER TABLE score_settings
  ADD COLUMN IF NOT EXISTS image_worldsend  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_compass    TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_drop       TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_suppress   TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_characters TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_winner     TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_bg         TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_bg_exp     TEXT NOT NULL DEFAULT '';
