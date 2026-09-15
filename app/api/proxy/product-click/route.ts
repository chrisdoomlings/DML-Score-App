import { NextRequest, NextResponse } from "next/server";
import { getVerifiedProxyParams } from "@/lib/utils/appProxy";
import { rateLimit } from "@/lib/utils/rateLimit";
import { logProductClick } from "@/lib/score/productAnalytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-cache, no-store" };

/** POST /apps/score/product-click — fired once a winner-screen "add to cart"
 *  tap's /cart/add.js call succeeds (see dmls-score.js winnerClicks()). Purely
 *  a click counter for the admin Analytics page; order/revenue attribution is
 *  separate, driven by the orders/paid webhook (app/api/webhooks/route.ts). */
export async function POST(req: NextRequest) {
  const params = getVerifiedProxyParams(req.nextUrl.searchParams, process.env.SHOPIFY_API_SECRET!);
  if (!params) return NextResponse.json({ error: "Invalid signature" }, { status: 403, headers: HEADERS });

  const shop = params.shop;
  if (!shop) return NextResponse.json({ error: "Missing shop" }, { status: 400, headers: HEADERS });

  if (!rateLimit(`product-click:${shop}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: HEADERS });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const variantId = Math.round(Number(body.variantId));
    if (!Number.isFinite(variantId) || variantId <= 0) {
      return NextResponse.json({ error: "Invalid variantId" }, { status: 400, headers: HEADERS });
    }
    const productTitle = typeof body.productTitle === "string" ? body.productTitle : "";

    await logProductClick(shop, variantId, productTitle);
    return NextResponse.json({ ok: true }, { headers: HEADERS });
  } catch (err) {
    console.error("[proxy/product-click POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500, headers: HEADERS });
  }
}
