import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { saveShop } from "@/lib/supabase/shopStore";
import { recordAttributedOrder } from "@/lib/score/productAnalytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The line-item property winnerClicks() (dmls-score.js) sets on every
// /cart/add.js call from the winner-screen recommended-products widget.
// Underscore-prefixed properties are hidden from the customer-facing cart UI
// by Shopify themes, so this tag is invisible to the shopper — it exists only
// for orders/paid attribution below.
const ATTRIBUTION_PROPERTY = "_dml_score_source";

interface OrderLineItem {
  price: string;
  quantity: number;
  properties: { name: string; value: string }[] | null;
}
interface OrderPayload {
  id: number;
  currency: string;
  line_items: OrderLineItem[];
}

/** Sums quantity/revenue across only the line items tagged by the widget —
 *  not the whole order — so a cart mixing widget and non-widget items doesn't
 *  overstate attribution. Returns null if nothing in the order is tagged. */
function extractAttribution(order: OrderPayload): { itemCount: number; revenue: number } | null {
  let itemCount = 0;
  let revenue = 0;
  for (const item of order.line_items ?? []) {
    const tagged = (item.properties ?? []).some((p) => p.name === ATTRIBUTION_PROPERTY);
    if (!tagged) continue;
    itemCount += item.quantity;
    revenue += Number(item.price) * item.quantity;
  }
  return itemCount > 0 ? { itemCount, revenue } : null;
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256") ?? "";
  const digest = crypto
    .createHmac("sha256", process.env.SHOPIFY_API_SECRET!)
    .update(raw, "utf8")
    .digest("base64");

  const a = Buffer.from(digest);
  const b = Buffer.from(hmacHeader);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Invalid HMAC" }, { status: 401 });
  }

  const topic = req.headers.get("x-shopify-topic") ?? "";
  const shop = req.headers.get("x-shopify-shop-domain") ?? "";

  if (topic === "app/uninstalled" && shop) {
    await saveShop(shop, { uninstalledAt: new Date().toISOString() });
  }

  if (topic === "orders/paid" && shop) {
    try {
      const order = JSON.parse(raw) as OrderPayload;
      const attribution = extractAttribution(order);
      if (attribution) {
        await recordAttributedOrder(shop, order.id, attribution.itemCount, attribution.revenue, order.currency);
      }
    } catch (err) {
      console.error("[webhooks orders/paid]", err);
    }
  }

  return NextResponse.json({ ok: true });
}
