-- DML Score — winner-screen recommended-products widget moves from the theme
-- editor's Liquid `collection` block setting into the app's own admin Settings
-- page (Settings → Products), so it can be changed without opening the theme
-- editor. recs_collection_id is a Shopify GID (gid://shopify/Collection/...)
-- resolved via Admin GraphQL, not a handle — Liquid can no longer render the
-- product loop itself once the choice lives here instead of a theme setting,
-- so dmls-score.js renders it client-side from /apps/score/config, using
-- products_cache/products_cache_at as a short-TTL cache in front of the Admin
-- API call (lib/score/products.ts) rather than hitting Shopify on every
-- storefront page load.
-- Run against the DEDICATED DML Score Supabase project only.

ALTER TABLE score_settings
  ADD COLUMN IF NOT EXISTS show_products BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS recs_collection_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS recs_collection_title TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS products_heading TEXT NOT NULL DEFAULT 'Level up your game',
  ADD COLUMN IF NOT EXISTS products_note TEXT NOT NULL DEFAULT 'One tap to add to cart.',
  ADD COLUMN IF NOT EXISTS products_cache JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS products_cache_at TIMESTAMPTZ;
