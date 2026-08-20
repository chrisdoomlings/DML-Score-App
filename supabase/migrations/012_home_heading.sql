-- DML Score — admin-editable home screen heading, replacing the theme-block
-- "data-heading" setting so copy can be changed from the app dashboard like
-- the tip banner text already is.
-- Run against the DEDICATED DML Score Supabase project only.
-- Empty string = fall back to the theme block's data-heading attribute
-- (same convention as the image_* columns: blank means "use the default").

ALTER TABLE score_settings
  ADD COLUMN IF NOT EXISTS home_heading TEXT NOT NULL DEFAULT '';
