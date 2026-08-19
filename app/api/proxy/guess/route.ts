import { NextRequest, NextResponse } from "next/server";
import { getVerifiedProxyParams } from "@/lib/utils/appProxy";
import { rateLimit } from "@/lib/utils/rateLimit";
import { getDb, jsonb } from "@/lib/supabase/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-cache, no-store" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** POST /apps/score/guess — one shot at "Guess Who Won?" for an offered game.
 *  The UPDATE's guess_name IS NULL guard makes the claim atomic: retries,
 *  refreshes, and parallel requests all see zero updated rows. No points
 *  payout — the mechanic is a reveal-timing novelty only. */
export async function POST(req: NextRequest) {
  const params = getVerifiedProxyParams(req.nextUrl.searchParams, process.env.SHOPIFY_API_SECRET!);
  if (!params) return NextResponse.json({ error: "Invalid signature" }, { status: 403, headers: HEADERS });

  const shop = params.shop;
  const customerId = params.logged_in_customer_id || null;
  if (!shop) return NextResponse.json({ error: "Missing shop" }, { status: 400, headers: HEADERS });
  if (!customerId) return NextResponse.json({ error: "Login required" }, { status: 401, headers: HEADERS });
  if (!rateLimit(`guess:${shop}:${customerId}`, 10, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: HEADERS });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const gameId = String(body.gameId ?? "");
    const guess = String(body.guess ?? "").trim().slice(0, 30);
    if (!UUID_RE.test(gameId) || !guess) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400, headers: HEADERS });
    }

    const db = getDb();
    const rows = await db<
      { winnerNames: string[]; topScore: number; guessCorrect: boolean }[]
    >`
      UPDATE score_games SET
        guess_name    = ${guess},
        guess_correct = winner_names @> ${jsonb([guess])}
      WHERE id = ${gameId}
        AND shop = ${shop}
        AND customer_id = ${customerId}
        AND guess_offered
        AND guess_name IS NULL
        AND played_at > NOW() - INTERVAL '30 minutes'
      RETURNING winner_names AS "winnerNames", top_score AS "topScore", guess_correct AS "guessCorrect"
    `;
    if (!rows.length) {
      return NextResponse.json({ error: "No guess available for this game" }, { status: 409, headers: HEADERS });
    }

    const { winnerNames, topScore, guessCorrect } = rows[0];
    return NextResponse.json(
      { correct: guessCorrect, winnerNames, topScore },
      { headers: HEADERS }
    );
  } catch (err) {
    console.error("[proxy/guess POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500, headers: HEADERS });
  }
}
