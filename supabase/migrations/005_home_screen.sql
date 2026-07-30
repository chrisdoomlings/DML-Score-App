-- DML Score — home screen logo + tip bar
-- Run against the DEDICATED DML Score Supabase project only.
-- image_logo: empty string = no logo shown (there is no bundled default logo).
-- tip_text: empty string = tip bar hidden.

ALTER TABLE score_settings
  ADD COLUMN IF NOT EXISTS image_logo TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tip_text   TEXT NOT NULL DEFAULT 'Tip: add Google’s keyboard if your phone doesn’t have a minus “-” symbol.';
