-- DML Score — admin-editable heading/subheading text for the Trophy screen
-- (see 015_trophy_images.sql for the screen's art columns). Same convention
-- as home_heading: a sensible default baked in, empty string not meaningful
-- here since both lines are always shown.
-- Run against the DEDICATED DML Score Supabase project only.

ALTER TABLE score_settings
  ADD COLUMN IF NOT EXISTS trophy_heading    TEXT NOT NULL DEFAULT 'Won The End Of The World!',
  ADD COLUMN IF NOT EXISTS trophy_subheading TEXT NOT NULL DEFAULT 'Did Not.';
