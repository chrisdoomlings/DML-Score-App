import { NextRequest, NextResponse } from "next/server";
import { getVerifiedProxyParams } from "@/lib/utils/appProxy";
import { rateLimit } from "@/lib/utils/rateLimit";
import { sanitizePlayers, saveGame, getCustomerStats } from "@/lib/score/games";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-cache, no-store" };

/** POST /apps/score/game — save a completed game. Guests allowed (no points). */
export async function POST(req: NextRequest) {
  const params = getVerifiedProxyParams(req.nextUrl.searchParams, process.env.SHOPIFY_API_SECRET!);
  if (!params) return NextResponse.json({ error: "Invalid signature" }, { status: 403, headers: HEADERS });

  const shop = params.shop;
  if (!shop) return NextResponse.json({ error: "Missing shop" }, { status: 400, headers: HEADERS });

  const customerId = params.logged_in_customer_id || null;
  if (!rateLimit(`game:${shop}:${customerId ?? "guest"}`, 20, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: HEADERS });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const players = sanitizePlayers(body.players);
    if (!players) {
      return NextResponse.json({ error: "Invalid players payload" }, { status: 400, headers: HEADERS });
    }
    // Guests can't claim a seat as "the customer"
    if (!customerId) players.forEach((p) => { p.isCustomer = false; });

    const { game, pointsAwarded, milestones, guessOffered } = await saveGame(shop, customerId, players);
    const stats = customerId ? await getCustomerStats(shop, customerId) : null;

    return NextResponse.json(
      {
        saved: true,
        gameId: game.id,
        // When the mini-game is offered the reveal is deferred to POST /guess.
        ...(guessOffered ? {} : { winnerNames: game.winnerNames, topScore: game.topScore }),
        pointsAwarded,
        milestones,
        guessOffered,
        stats: stats
          ? { gamesLogged: stats.gamesLogged, wins: stats.wins, bestScore: stats.bestScore, points: stats.points }
          : null,
      },
      { headers: HEADERS }
    );
  } catch (err) {
    console.error("[proxy/game POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500, headers: HEADERS });
  }
}
