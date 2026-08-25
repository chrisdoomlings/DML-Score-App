-- DML Score — optional solid background color behind the trophy screen's
-- action buttons (Rematch!/Or New Players/Achievements), which sit below
-- the trophy art and should NOT show that art's background image. Empty by
-- default (transparent — falls back to the card's own plain gradient).
-- Run against the DEDICATED DML Score Supabase project only.

ALTER TABLE score_settings
  ADD COLUMN IF NOT EXISTS trophy_actions_bg TEXT NOT NULL DEFAULT '';
