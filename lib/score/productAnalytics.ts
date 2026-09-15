import { getDb } from "@/lib/supabase/client";

/** One successful /cart/add.js call from the winner-screen recommended-products
 *  widget — see dmls-score.js winnerClicks() and app/api/proxy/product-click.
 *  Fire-and-forget from the caller; a lost click here just undercounts by one,
 *  never blocks the add-to-cart itself. */
export async function logProductClick(shop: string, variantId: number, productTitle: string): Promise<void> {
  const db = getDb();
  await db`
    INSERT INTO score_product_clicks (shop, variant_id, product_title)
    VALUES (${shop}, ${variantId}, ${productTitle.slice(0, 200)})
  `;
}

/** Records one paid order that contained at least one widget-added line item.
 *  Idempotent on (shop, order_id) — orders/paid can redeliver the same
 *  webhook. Returns false (no-op) on a duplicate delivery. */
export async function recordAttributedOrder(
  shop: string,
  orderId: number,
  itemCount: number,
  revenue: number,
  currency: string
): Promise<boolean> {
  const db = getDb();
  const rows = await db<{ id: number }[]>`
    INSERT INTO score_attributed_orders (shop, order_id, item_count, revenue, currency)
    VALUES (${shop}, ${orderId}, ${itemCount}, ${revenue}, ${currency})
    ON CONFLICT (shop, order_id) DO NOTHING
    RETURNING id
  `;
  return rows.length > 0;
}

export interface ProductAnalytics {
  totalClicks: number;
  clicksLast30Days: number;
  topProducts: { productTitle: string; clicks: number }[];
  attributedOrders: number;
  revenueByCurrency: { currency: string; revenue: number; orders: number }[];
}

/** Backs the admin Analytics page's "Recommended products" card — add-to-cart
 *  click volume alongside orders/revenue actually attributed via the
 *  orders/paid webhook (see recordAttributedOrder above). The two counts are
 *  independent: a click is logged the instant /cart/add.js succeeds, an order
 *  only shows up here once the shopper actually pays. */
export async function getProductAnalytics(shop: string): Promise<ProductAnalytics> {
  const db = getDb();
  const [clicks, topProducts, orders] = await Promise.all([
    db<{ total: number; last30: number }[]>`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int AS last30
      FROM score_product_clicks WHERE shop = ${shop}
    `,
    db<{ productTitle: string; clicks: number }[]>`
      SELECT product_title AS "productTitle", COUNT(*)::int AS clicks
      FROM score_product_clicks
      WHERE shop = ${shop} AND product_title != ''
      GROUP BY product_title ORDER BY clicks DESC LIMIT 10
    `,
    db<{ currency: string; revenue: string; orders: number }[]>`
      SELECT currency, SUM(revenue)::text AS revenue, COUNT(*)::int AS orders
      FROM score_attributed_orders WHERE shop = ${shop}
      GROUP BY currency ORDER BY orders DESC
    `,
  ]);

  return {
    totalClicks: clicks[0]?.total ?? 0,
    clicksLast30Days: clicks[0]?.last30 ?? 0,
    topProducts,
    attributedOrders: orders.reduce((sum, o) => sum + o.orders, 0),
    revenueByCurrency: orders.map((o) => ({ currency: o.currency, revenue: Number(o.revenue), orders: o.orders })),
  };
}
