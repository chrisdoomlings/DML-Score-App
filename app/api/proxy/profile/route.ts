import { NextRequest, NextResponse } from "next/server";
import { getVerifiedProxyParams } from "@/lib/utils/appProxy";
import { rateLimit } from "@/lib/utils/rateLimit";
import { getDb } from "@/lib/supabase/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-cache, no-store" };
const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** POST /apps/score/profile — self-reported birthday capture (for the
 *  locked "Birthdoom" achievement tile). Logged-in customers only. */
export async function POST(req: NextRequest) {
  const params = getVerifiedProxyParams(req.nextUrl.searchParams, process.env.SHOPIFY_API_SECRET!);
  if (!params) return NextResponse.json({ error: "Invalid signature" }, { status: 403, headers: HEADERS });

  const shop = params.shop;
  const customerId = params.logged_in_customer_id || null;
  if (!shop) return NextResponse.json({ error: "Missing shop" }, { status: 400, headers: HEADERS });
  if (!customerId) return NextResponse.json({ error: "Login required" }, { status: 401, headers: HEADERS });
  if (!rateLimit(`profile:${shop}:${customerId}`, 10, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: HEADERS });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const birthday = String(body.birthday ?? "");
    if (!LOCAL_DATE_RE.test(birthday)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400, headers: HEADERS });
    }

    const db = getDb();
    await db`
      INSERT INTO score_customer_profile (shop, customer_id, birthday, updated_at)
      VALUES (${shop}, ${customerId}, ${birthday}, NOW())
      ON CONFLICT (shop, customer_id) DO UPDATE SET
        birthday   = EXCLUDED.birthday,
        updated_at = NOW()
    `;

    return NextResponse.json({ saved: true }, { headers: HEADERS });
  } catch (err) {
    console.error("[proxy/profile POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500, headers: HEADERS });
  }
}
