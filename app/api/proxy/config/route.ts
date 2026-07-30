import { NextRequest, NextResponse } from "next/server";
import { getVerifiedProxyParams } from "@/lib/utils/appProxy";
import { getSettings } from "@/lib/score/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-cache, no-store" };

export async function GET(req: NextRequest) {
  const params = getVerifiedProxyParams(req.nextUrl.searchParams, process.env.SHOPIFY_API_SECRET!);
  if (!params) return NextResponse.json({ error: "Invalid signature" }, { status: 403, headers: HEADERS });

  const shop = params.shop;
  if (!shop) return NextResponse.json({ error: "Missing shop" }, { status: 400, headers: HEADERS });

  try {
    const settings = await getSettings(shop);
    const images = Object.fromEntries(
      Object.entries(settings.images).filter(([, url]) => url)
    );
    return NextResponse.json(
      {
        pointsPerGame: settings.pointsPerGame,
        guessPoints: settings.guessEnabled ? settings.guessPoints : 0,
        loggedIn: Boolean(params.logged_in_customer_id),
        images,
        tipText: settings.tipText,
      },
      { headers: HEADERS }
    );
  } catch (err) {
    console.error("[proxy/config GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500, headers: HEADERS });
  }
}
