-- DML Score — merchant opt-in: while the score tool's card is open, lock
-- the underlying storefront page from scrolling so only the tool's own
-- content (e.g. the Add Names list) scrolls. Off by default — the Sept 2026
-- rebuild deliberately made the tool scroll inline with the page; this is an
-- explicit admin toggle to opt back into the old modal-style locked scroll.
-- Run against the DEDICATED DML Score Supabase project only.

ALTER TABLE score_settings
  ADD COLUMN IF NOT EXISTS lock_page_scroll BOOLEAN NOT NULL DEFAULT false;
