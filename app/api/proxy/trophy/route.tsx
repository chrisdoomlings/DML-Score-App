import { NextRequest } from "next/server";
import { ImageResponse } from "next/og";
import { getVerifiedProxyParams } from "@/lib/utils/appProxy";
import { rateLimit } from "@/lib/utils/rateLimit";

// next/og's ImageResponse needs Node APIs it can't get on the edge runtime,
// and verifyProxySignature uses Node's crypto (createHmac) — same reason
// every other proxy route stays on nodejs.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WIDTH = 1200;
const HEIGHT = 630;

/** Cosmetic only — same trust model as the rest of the winner screen (see
 *  CLAUDE.md: "scores are entered client-side, the reveal-withholding is UX,
 *  not security"). Client-supplied params, sanitized for safe rendering and
 *  length, not verified against score_games. */
function sanitizeName(v: string | null): string {
  const s = (v ?? "").trim().slice(0, 40);
  return s || "Winner";
}
function sanitizeScore(v: string | null): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 0;
  return Math.max(-999, Math.min(9999, n));
}
function sanitizeDateLabel(v: string | null): string {
  if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(v + "T00:00:00Z");
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
    }
  }
  return new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** GET /apps/score/trophy — renders a shareable "trophy" image for the
 *  winner screen's Generate Trophy button. Stateless: everything needed to
 *  render comes from the query string (the client already has the winner's
 *  name/score/date at reveal time), so this needs no DB lookup and the same
 *  URL always renders the same image — cacheable, and trivially shareable
 *  as a plain link/image src. */
export async function GET(req: NextRequest) {
  const params = getVerifiedProxyParams(req.nextUrl.searchParams, process.env.SHOPIFY_API_SECRET!);
  if (!params) return new Response("Invalid signature", { status: 403 });

  const shop = params.shop;
  if (!shop) return new Response("Missing shop", { status: 400 });
  if (!rateLimit(`trophy:${shop}`, 60, 60_000)) {
    return new Response("Too many requests", { status: 429 });
  }

  const sp = req.nextUrl.searchParams;
  const name = sanitizeName(sp.get("name"));
  const score = sanitizeScore(sp.get("score"));
  const dateLabel = sanitizeDateLabel(sp.get("date"));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#10153f",
          backgroundImage: "linear-gradient(180deg, #2a3182 0%, #10153f 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: 1040,
            height: 470,
            borderRadius: 32,
            border: "3px solid rgba(255,255,255,0.25)",
            backgroundColor: "rgba(0,0,0,0.18)",
          }}
        >
          <div style={{ display: "flex", fontSize: 64 }}>{"\u{1F3C6}"}</div>
          <div
            style={{
              display: "flex",
              fontSize: 22,
              letterSpacing: 6,
              color: "#ffd54a",
              fontWeight: 700,
              textTransform: "uppercase",
              marginTop: 8,
            }}
          >
            Doomlings Champion
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 84,
              fontWeight: 800,
              color: "#ffffff",
              marginTop: 18,
              maxWidth: 900,
              textAlign: "center",
              lineHeight: 1.1,
            }}
          >
            {name}
          </div>
          <div style={{ display: "flex", fontSize: 34, color: "#b8bde4", marginTop: 14 }}>
            {score + " points · " + dateLabel}
          </div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: { "Cache-Control": "public, max-age=86400" },
    }
  );
}
