-- DML Score — optional second line of trophy-screen text, shown between the
-- loser-names line and the bold "Did Not." line. Empty by default and hidden
-- when blank (unlike trophy_heading/trophy_subheading, which always show).
-- Run against the DEDICATED DML Score Supabase project only.

ALTER TABLE score_settings
  ADD COLUMN IF NOT EXISTS trophy_tagline TEXT NOT NULL DEFAULT '';
