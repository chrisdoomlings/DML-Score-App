-- DML Score — per-step admin content for the 4 scoring screens (World's
-- End, Face Value, Bonus Points, Expansion Points): heading/description
-- text as one JSONB blob (same convention as score_settings.achievements —
-- see lib/score/steps.ts's mergeStepConfig), plus 3 new background-image
-- slots. Expansion Points already had its own background (image_bg_exp,
-- added earlier) — this fills in the other 3 steps to match.
-- Run against the DEDICATED DML Score Supabase project only.

ALTER TABLE score_settings
  ADD COLUMN IF NOT EXISTS image_bg_we TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_bg_fv TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_bg_bp TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS steps JSONB NOT NULL DEFAULT '{}'::jsonb;
