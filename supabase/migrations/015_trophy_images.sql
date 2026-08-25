-- DML Score — admin-uploadable art for the new full-screen "Trophy" page
-- (reached from the winner screen's Generate Trophy button): a scene
-- background and a top illustration, same empty-string-means-unset
-- convention as every other image_* column.
-- Run against the DEDICATED DML Score Supabase project only.

ALTER TABLE score_settings
  ADD COLUMN IF NOT EXISTS image_trophy_bg  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_trophy_top TEXT NOT NULL DEFAULT '';
