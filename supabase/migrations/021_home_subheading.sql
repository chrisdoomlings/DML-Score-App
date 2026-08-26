-- DML Score — admin-editable welcome-screen subheading, replacing the
-- hardcoded "Tally World's End, face value, and bonus points — we'll crown
-- the winner." line in dmls-score.js with a configurable field (same
-- convention as tip_text/home_heading: empty string = hidden).
-- Run against the DEDICATED DML Score Supabase project only.
-- DEFAULT is the exact previous hardcoded text, so existing installs render
-- unchanged until an admin edits or clears it.

ALTER TABLE score_settings
  ADD COLUMN IF NOT EXISTS home_subheading TEXT NOT NULL DEFAULT 'Tally World’s End, face value, and bonus points — we’ll crown the winner.';
