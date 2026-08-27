-- DML Score — admin-uploadable image shown at the very bottom of the
-- winner screen (below the achievements/loyalty widget and product
-- recommendations), e.g. a promo banner. Empty string = hidden, same
-- convention as every other image_* column.
-- Run against the DEDICATED DML Score Supabase project only.

ALTER TABLE score_settings
  ADD COLUMN IF NOT EXISTS image_winner_footer TEXT NOT NULL DEFAULT '';
