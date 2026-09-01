-- DML Score — merchant-configurable size of the #dmls-modal shell itself
-- (the outer overlay window), distinct from card_min_height (which only
-- floors the height of the content card inside it). Width is a px cap
-- (still bounded by 92vw on narrow phones); height is a vh percentage.
-- Run against the DEDICATED DML Score Supabase project only.

ALTER TABLE score_settings
  ADD COLUMN IF NOT EXISTS modal_width  INTEGER NOT NULL DEFAULT 520,
  ADD COLUMN IF NOT EXISTS modal_height INTEGER NOT NULL DEFAULT 90;
