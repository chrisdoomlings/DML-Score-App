import { NextRequest, NextResponse } from "next/server";
import { getVerifiedProxyParams } from "@/lib/utils/appProxy";
import { getCustomerAchievements, getCustomerHistory, getCustomerGamesPlayedCount } from "@/lib/score/games";
import { getCustomerBirthday } from "@/lib/score/achievements";
import { getDb } from "@/lib/supabase/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-cache, no-store" };

/** GET /apps/score/achievements — achievements + game history for the logged-in
 *  customer, fetched together in one round trip (both modal tabs at once). */
export async function GET(req: NextRequest) {
  const params = getVerifiedProxyParams(req.nextUrl.searchParams, process.env.SHOPIFY_API_SECRET!);
  if (!params) return NextResponse.json({ error: "Invalid signature" }, { status: 403, headers: HEADERS });

  const shop = params.shop;
  const customerId = params.logged_in_customer_id || "";
  if (!shop) return NextResponse.json({ error: "Missing shop" }, { status: 400, headers: HEADERS });
  if (!customerId) return NextResponse.json({ authenticated: false }, { headers: HEADERS });

  try {
    const db = getDb();
    const [achievements, recentGames, birthday, gamesPlayed] = await Promise.all([
      getCustomerAchievements(shop, customerId),
      getCustomerHistory(shop, customerId),
      getCustomerBirthday(db, shop, customerId),
      getCustomerGamesPlayedCount(shop, customerId),
    ]);

    return NextResponse.json(
      {
        authenticated: true,
        achievements,
        recentGames,
        gamesPlayed,
        profile: { hasBirthday: Boolean(birthday) },
      },
      { headers: HEADERS }
    );
  } catch (err) {
    console.error("[proxy/achievements GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500, headers: HEADERS });
  }
}
