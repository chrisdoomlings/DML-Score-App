import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { Session } from "@shopify/shopify-api";
import { saveShop } from "@/lib/supabase/shopStore";
import { sessionStorage } from "@/lib/supabase/sessionStore";
import { safeEqualHex } from "@/lib/utils/timingSafeEqual";
import { signShop, COOKIE_NAME, STANDALONE_SESSION_MAX_AGE_SECONDS } from "@/lib/utils/standaloneSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCOPES = "read_customers";
const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

function verifyState(shop: string, state: string): boolean {
  const parts = state.split(".");
  if (parts.length !== 2) return false;
  const [ts, mac] = parts;
  const age = Date.now() - parseInt(ts, 10);
  if (isNaN(age) || age < 0 || age > STATE_MAX_AGE_MS) return false;
  const expected = crypto.createHmac("sha256", process.env.SESSION_SECRET!).update(`${shop}.${ts}`).digest("hex");
  return safeEqualHex(expected, mac);
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const shop = searchParams.get("shop") ?? "";
    const code = searchParams.get("code") ?? "";
    const state = searchParams.get("state") ?? "";
    const hmac = searchParams.get("hmac") ?? "";

    if (!state || !verifyState(shop, state)) {
      return NextResponse.json({ error: "Invalid OAuth state" }, { status: 400 });
    }

    const params: Record<string, string> = {};
    searchParams.forEach((value, key) => { if (key !== "hmac") params[key] = value; });
    const message = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
    const digest = crypto.createHmac("sha256", process.env.SHOPIFY_API_SECRET!).update(message).digest("hex");
    if (!safeEqualHex(digest, hmac)) {
      return NextResponse.json({ error: "Invalid OAuth signature" }, { status: 400 });
    }

    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: process.env.SHOPIFY_API_KEY, client_secret: process.env.SHOPIFY_API_SECRET, code }),
    });

    if (!tokenRes.ok) {
      return NextResponse.json({ error: "Token exchange failed" }, { status: 400 });
    }

    const { access_token } = await tokenRes.json();

    const session = Session.fromPropertyArray([
      ["id", `offline_${shop}`],
      ["shop", shop],
      ["state", state],
      ["isOnline", false],
      ["accessToken", access_token],
      ["scope", SCOPES],
    ]);
    await sessionStorage.storeSession(session);
    await saveShop(shop, { installedAt: new Date().toISOString(), uninstalledAt: null });

    const cookieValue = await signShop(shop);
    const redirectUrl = new URL("/app/dashboard", req.nextUrl.origin);
    redirectUrl.searchParams.set("shop", shop);

    const res = NextResponse.redirect(redirectUrl);
    res.cookies.set(COOKIE_NAME, cookieValue, {
      httpOnly: true,
      secure: true,
      // Lax, not None: this app is not embedded (no iframe), so the cookie
      // never needs to travel cross-site — Lax also blocks it on cross-site
      // POSTs, closing the CSRF gap on /api/admin/* for free.
      sameSite: "lax",
      maxAge: STANDALONE_SESSION_MAX_AGE_SECONDS,
      path: "/",
    });
    return res;
  } catch (err) {
    console.error("[auth/callback]", err);
    const shop = req.nextUrl.searchParams.get("shop") ?? "";
    const retryUrl = new URL("/auth", req.nextUrl.origin);
    retryUrl.searchParams.set("shop", shop);
    return NextResponse.redirect(retryUrl);
  }
}
