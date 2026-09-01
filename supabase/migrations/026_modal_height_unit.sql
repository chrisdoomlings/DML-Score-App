-- DML Score — lets the merchant pick whether modal_height (025_modal_size.sql)
-- is interpreted as a vh percentage or a fixed px value. modal_height itself
-- keeps storing the raw number either way; this just tags which unit it's in.
-- Run against the DEDICATED DML Score Supabase project only.

ALTER TABLE score_settings
  ADD COLUMN IF NOT EXISTS modal_height_unit TEXT NOT NULL DEFAULT 'vh';
