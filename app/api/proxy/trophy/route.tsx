import { readFile } from "fs/promises";
import path from "path";
import { NextRequest } from "next/server";
import { ImageResponse } from "next/og";
import { getVerifiedProxyParams } from "@/lib/utils/appProxy";
import { rateLimit } from "@/lib/utils/rateLimit";

// next/og's ImageResponse needs Node APIs it can't get on the edge runtime,
// and verifyProxySignature uses Node's crypto (createHmac) — same reason
// every other proxy route stays on nodejs.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Same display font used on-screen for the trophy plate/heading/subheading
// (see @font-face in dmls-score.css) — without loading it here, ImageResponse
// falls back to a generic sans-serif and the shared PNG looks nothing like
// what the player actually saw. Extracted once from that CSS file's embedded
// base64 into lib/score/assets/dmls-catastrophe.woff (see git history for the
// extraction) — cached at module scope so it's read from disk once per
// server instance, not on every request.
let displayFont: Buffer | null = null;
async function getDisplayFont(): Promise<Buffer> {
  if (!displayFont) {
    displayFont = await readFile(path.join(process.cwd(), "lib/score/assets/dmls-catastrophe.woff"));
  }
  return displayFont;
}

// Regular body font for everything that ISN'T the display font (loser names,
// tagline, the score/date footer). Registering `fonts` at all replaces
// ImageResponse's own built-in default — without a second font here, every
// text node falls back to DMLS Catastrophe regardless of its own fontFamily,
// including ones with no requested family at all. That font is decorative
// and missing full digit/punctuation coverage, which is why the score number
// and the date's day/year silently vanished (satori has nothing to render
// them with) while the letters around them still showed. Same file next/og
// itself uses as its own default (@vercel/og ships it for exactly this
// purpose) — copied into our own assets so it's a normal tracked project
// file instead of a runtime read into node_modules internals.
let bodyFont: Buffer | null = null;
async function getBodyFont(): Promise<Buffer> {
  if (!bodyFont) {
    bodyFont = await readFile(path.join(process.cwd(), "lib/score/assets/geist-regular.ttf"));
  }
  return bodyFont;
}

// Portrait, phone-screenshot-shaped — this is meant to be shared to a story/
// chat the same way a player would screenshot the in-app trophy screen, not
// a landscape link-preview card.
const WIDTH = 1080;
const HEIGHT = 1920;

/** Cosmetic only — same trust model as the rest of the winner screen (see
 *  CLAUDE.md: "scores are entered client-side, the reveal-withholding is UX,
 *  not security"). Client-supplied params, sanitized for safe rendering and
 *  length, not verified against score_games. */
function sanitizeText(v: string | null, max: number): string {
  return (v ?? "").trim().slice(0, max);
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
/** The trophy-graphic URL is fetched server-side and embedded in the
 *  generated image — restrict it to this app's own R2 bucket (where every
 *  admin-uploaded trophy design actually lives) so a crafted query string
 *  can't make this route fetch/embed an arbitrary external image. */
function sanitizeImageParam(v: string | null): string {
  const raw = (v ?? "").trim();
  const base = (process.env.CLOUDFLARE_R2_PUBLIC_URL || "").replace(/\/$/, "");
  if (!raw || !base) return "";
  return raw.startsWith(base + "/") ? raw : "";
}

/** GET /apps/score/trophy — renders a shareable image matching the in-app
 *  trophy screen (renderTrophy() in dmls-score.js): the randomly-picked
 *  trophy graphic with the winner's name plated over it, heading, loser
 *  names, tagline, and subheading. Stateless: everything needed to render
 *  comes from the query string (the client already has all of this at
 *  reveal time — including which trophy design it randomly picked, passed
 *  through as `top` so the shared image matches what the player actually
 *  saw instead of rolling a new one), so this needs no DB lookup and the
 *  same URL always renders the same image. */
export async function GET(req: NextRequest) {
  const params = getVerifiedProxyParams(req.nextUrl.searchParams, process.env.SHOPIFY_API_SECRET!);
  if (!params) return new Response("Invalid signature", { status: 403 });

  const shop = params.shop;
  if (!shop) return new Response("Missing shop", { status: 400 });
  if (!rateLimit(`trophy:${shop}`, 60, 60_000)) {
    return new Response("Too many requests", { status: 429 });
  }

  const sp = req.nextUrl.searchParams;
  const name = sanitizeText(sp.get("name"), 40) || "Winner";
  const score = sanitizeScore(sp.get("score"));
  const dateLabel = sanitizeDateLabel(sp.get("date"));
  const topImage = sanitizeImageParam(sp.get("top"));
  const bgImage = sanitizeImageParam(sp.get("bg"));
  const heading = sanitizeText(sp.get("heading"), 80) || "Won The End Of The World!";
  const subheading = sanitizeText(sp.get("sub"), 60) || "Did Not.";
  const tagline = sanitizeText(sp.get("tagline"), 120);
  const losers = sanitizeText(sp.get("losers"), 300);

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
          // Mirrors .dmls-trophy-fill on-screen: the shop's configured trophy
          // background (falls back to the winner/main background — see the
          // `bg` param built client-side) under the same dark overlay
          // gradient, or the plain gradient alone when nothing's configured.
          backgroundImage: bgImage
            ? 'linear-gradient(180deg, rgba(16,21,63,0.35), rgba(16,21,63,0.65)), url("' + bgImage + '")'
            : "linear-gradient(180deg, #2a3182 0%, #10153f 100%)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          fontFamily: "Geist",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width: 960,
            height: 1760,
            borderRadius: 48,
            border: "3px solid rgba(255,255,255,0.25)",
            backgroundColor: "rgba(0,0,0,0.18)",
            overflow: "hidden",
            padding: "56px 48px",
            textAlign: "center",
          }}
        >
          {topImage ? (
            <div style={{ display: "flex", position: "relative", width: "100%" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={topImage} width={864} height={864} style={{ width: "100%", height: 864, objectFit: "contain" }} />
              <div
                style={{
                  position: "absolute",
                  left: "8%",
                  right: "8%",
                  top: "74%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    fontFamily: "DMLS Catastrophe",
                    fontSize: 52,
                    fontWeight: 400,
                    color: "#ffffff",
                    textTransform: "uppercase",
                    letterSpacing: 2,
                  }}
                >
                  {name}
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                fontFamily: "DMLS Catastrophe",
                fontSize: 64,
                fontWeight: 400,
                color: "#4a3200",
                textTransform: "uppercase",
                background: "linear-gradient(180deg, #ffe9a8, #ffd54a)",
                borderRadius: 20,
                padding: "20px 48px",
                marginTop: 40,
              }}
            >
              {name}
            </div>
          )}

          <div
            style={{
              display: "flex",
              fontFamily: "DMLS Catastrophe",
              fontSize: 56,
              fontWeight: 400,
              color: "#ffffff",
              marginTop: 48,
              maxWidth: 820,
              textAlign: "center",
              lineHeight: 1.15,
            }}
          >
            {heading}
          </div>

          <div style={{ display: "flex", width: "70%", height: 1, backgroundColor: "rgba(255,255,255,0.2)", marginTop: 40 }} />

          {losers ? (
            <div
              style={{
                display: "flex",
                fontSize: 32,
                fontStyle: "italic",
                color: "#b8bde4",
                marginTop: 40,
                maxWidth: 820,
                textAlign: "center",
              }}
            >
              {losers}
            </div>
          ) : null}

          {tagline ? (
            <div
              style={{
                display: "flex",
                fontSize: 30,
                fontStyle: "italic",
                color: "#b8bde4",
                marginTop: 16,
                maxWidth: 700,
                textAlign: "center",
              }}
            >
              {tagline}
            </div>
          ) : null}

          {losers ? (
            <div
              style={{
                display: "flex",
                fontFamily: "DMLS Catastrophe",
                fontSize: 44,
                fontWeight: 400,
                color: "#ffffff",
                textTransform: "uppercase",
                marginTop: 16,
              }}
            >
              {subheading}
            </div>
          ) : null}

          <div style={{ display: "flex", fontSize: 28, color: "#8a90c9", marginTop: "auto" }}>
            {score + " points · " + dateLabel}
          </div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: { "Cache-Control": "public, max-age=86400" },
      fonts: [
        { name: "DMLS Catastrophe", data: await getDisplayFont(), style: "normal", weight: 400 },
        { name: "Geist", data: await getBodyFont(), style: "normal", weight: 400 },
      ],
    }
  );
}
