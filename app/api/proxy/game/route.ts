import { NextRequest, NextResponse } from "next/server";
import { getVerifiedProxyParams } from "@/lib/utils/appProxy";
import { rateLimit } from "@/lib/utils/rateLimit";
import { sanitizePlayers, saveGame } from "@/lib/score/games";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-cache, no-store" };
const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function sanitizeDeviceType(v: unknown): "mobile" | "desktop" | null {
  return v === "mobile" || v === "desktop" ? v : null;
}

function sanitizeLocalDate(v: unknown): string | null {
  return typeof v === "string" && LOCAL_DATE_RE.test(v) ? v : null;
}

/** Transient — used only to evaluate the Gen Con achievement, never persisted. */
function sanitizeGeo(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  if (la < -90 || la > 90 || lo < -180 || lo > 180) return null;
  return { lat: la, lng: lo };
}

/** POST /apps/score/game — save a completed game. Guests allowed (no achievements). */
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

    const deviceType = sanitizeDeviceType(body.deviceType);
    const playedAtLocalDate = sanitizeLocalDate(body.playedAtLocalDate);
    const geo = sanitizeGeo(body.lat, body.lng);

    const { game, achievementsUnlocked, guessOffered, gamesPlayed } = await saveGame(
      shop,
      customerId,
      players,
      deviceType,
      playedAtLocalDate,
      geo
    );

    return NextResponse.json(
      {
        saved: true,
        gameId: game.id,
        // When the mini-game is offered the reveal is deferred to POST /guess.
        ...(guessOffered ? {} : { winnerNames: game.winnerNames, topScore: game.topScore }),
        achievementsUnlocked,
        guessOffered,
        gamesPlayed,
      },
      { headers: HEADERS }
    );
  } catch (err) {
    console.error("[proxy/game POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500, headers: HEADERS });
  }
}
