-- DML Score — admin-uploadable inline icons for the step description text.
-- The 4 scoring steps' descriptions (lib/score/steps.ts DEFAULT_STEPS) embed
-- a few game-symbol Unicode glyphs directly (➹ World's End, ⊕ bonus,
-- 💧 Drop of Life) — Unicode glyph rendering isn't consistent enough across
-- devices/fonts, so each gets an optional custom icon image that the
-- storefront swaps in for the matching character wherever it appears in a
-- step's description (see stepSubHTML() in dmls-score.js). Empty = keep
-- rendering the plain Unicode character, same as before this migration.
--
-- Only ⊕ needs a new column: images.worldsend/images.drop (image_worldsend/
-- image_drop) already existed since 003_custom_images.sql — fully wired
-- through settings.ts and the storefront's generic ICONS merge, just never
-- exposed in the admin UI or consumed by name in dmls-score.js — and their
-- names already match this exact purpose, so they're reused as the World's
-- End and Drop of Life icons rather than adding duplicate columns.
-- Run against the DEDICATED DML Score Supabase project only.

ALTER TABLE score_settings
  ADD COLUMN IF NOT EXISTS image_icon_bonus TEXT NOT NULL DEFAULT '';
