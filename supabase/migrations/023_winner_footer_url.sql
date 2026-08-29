-- DML Score — optional click-through link for the winner-screen bottom
-- banner image (image_winner_footer, added in 022). Same convention as
-- discord_url: empty string = image renders as a plain <img>, not a link.
-- Run against the DEDICATED DML Score Supabase project only.

ALTER TABLE score_settings
  ADD COLUMN IF NOT EXISTS winner_footer_url TEXT NOT NULL DEFAULT '';
