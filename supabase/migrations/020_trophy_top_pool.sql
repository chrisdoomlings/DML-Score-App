-- DML Score — the trophy screen's top illustration becomes a POOL of up to
-- ~30 designs (client confirmed: pick one at random each time "Generate
-- Trophy" is hit, for variety). Replaces the single image_trophy_top slot.
-- Backfills any already-uploaded single image into the new array so nothing
-- is lost; image_trophy_top itself is left in place (unused going forward)
-- rather than dropped, per this app's additive-only migration convention.
-- Run against the DEDICATED DML Score Supabase project only.

ALTER TABLE score_settings
  ADD COLUMN IF NOT EXISTS trophy_top_images JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE score_settings
SET trophy_top_images = jsonb_build_array(image_trophy_top)
WHERE image_trophy_top <> '' AND trophy_top_images = '[]'::jsonb;
