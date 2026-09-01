-- DML Score — optional per-step BACKGROUND override (distinct from the
-- existing per-step "character image" slots image_bg_we/fv/bp/exp, which
-- layer on top of the shared background and stay as-is). When one of these
-- is set, the storefront uses it instead of the shared background
-- (score_settings.image_bg) for that one step only; the character image
-- still layers on top of whichever background is showing.
-- Run against the DEDICATED DML Score Supabase project only.

ALTER TABLE score_settings
  ADD COLUMN IF NOT EXISTS image_bg_we_custom  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_bg_fv_custom  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_bg_bp_custom  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_bg_exp_custom TEXT NOT NULL DEFAULT '';
