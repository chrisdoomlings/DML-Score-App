-- DML Score — product analytics for the winner-screen recommended-products
-- widget: how many "add to cart" taps it drives, and how much of that turns
-- into real orders/revenue. Two separate tables because they're populated by
-- two very different paths:
--   * score_product_clicks: logged synchronously from POST /apps/score/product-click
--     (app proxy, see app/api/proxy/product-click/route.ts) the moment a
--     storefront visitor's /cart/add.js call succeeds in dmls-score.js's
--     winnerClicks(). Always known immediately; not tied to checkout completing.
--   * score_attributed_orders: populated by the orders/paid webhook
--     (app/api/webhooks/route.ts) once a cart containing a widget-added item
--     actually gets paid for. Attribution works via the `_dml_score_source`
--     line-item property winnerClicks() sets on every /cart/add.js call —
--     underscore-prefixed properties are hidden from the customer-facing cart
--     UI by Shopify themes, so this is invisible to the shopper. Revenue is
--     summed only across the tagged line items in an order, not the whole
--     order total, so a cart mixing widget and non-widget items doesn't
--     overstate attribution.
-- Requires the read_orders scope (lib/utils/scopes.ts) — existing installs
-- must re-approve the app (Shopify re-consent) before orders/paid webhooks
-- start delivering for them; until then this simply stays empty for that shop.
-- Run against the DEDICATED DML Score Supabase project only.

CREATE TABLE IF NOT EXISTS score_product_clicks (
  id BIGSERIAL PRIMARY KEY,
  shop TEXT NOT NULL,
  variant_id BIGINT NOT NULL,
  product_title TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS score_product_clicks_shop_idx ON score_product_clicks (shop, created_at);

CREATE TABLE IF NOT EXISTS score_attributed_orders (
  id BIGSERIAL PRIMARY KEY,
  shop TEXT NOT NULL,
  order_id BIGINT NOT NULL,
  item_count INT NOT NULL,
  revenue NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shop, order_id) -- webhook redeliveries are common; makes the insert idempotent
);
CREATE INDEX IF NOT EXISTS score_attributed_orders_shop_idx ON score_attributed_orders (shop, created_at);
