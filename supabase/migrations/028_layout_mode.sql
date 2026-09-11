-- DML Score — merchant opt-in: render the score tool as the pre-Sept-2026
-- full-screen overlay modal (fixed position, backdrop, locked page scroll)
-- instead of today's default inline-in-page layout. 'inline' (default) or
-- 'modal'; validated in app code, not a DB CHECK constraint, same pattern
-- as modal_height_unit.
-- Run against the DEDICATED DML Score Supabase project only.

ALTER TABLE score_settings
  ADD COLUMN IF NOT EXISTS layout_mode TEXT NOT NULL DEFAULT 'inline';
