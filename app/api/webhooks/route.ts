import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { saveShop } from "@/lib/supabase/shopStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  return NextResponse.json({ ok: true });
}
