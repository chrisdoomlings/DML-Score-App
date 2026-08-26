-- DML Score — admin-editable welcome-screen subheading, replacing the
-- hardcoded "Tally World's End, face value, and bonus points — we'll crown
-- the winner." line in dmls-score.js with a configurable field (same
-- convention as tip_text/home_heading: empty string = hidden).
-- Run against the DEDICATED DML Score Supabase project only.
-- DEFAULT is empty (hidden) — the old hardcoded line is being removed
-- outright, not just made editable, so it should not reappear on migrate.

ALTER TABLE score_settings
  ADD COLUMN IF NOT EXISTS home_subheading TEXT NOT NULL DEFAULT '';
