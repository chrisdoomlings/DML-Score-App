import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCOPES = "read_customers";

// Stateless HMAC state — no cookies needed
function buildState(shop: string): string {
  const ts = Date.now().toString();
  const mac = crypto.createHmac("sha256", process.env.SESSION_SECRET!).update(`${shop}.${ts}`).digest("hex");
  return `${ts}.${mac}`;
}

export async function GET(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get("shop") ?? "";

  if (!shop) return NextResponse.json({ error: "Missing shop parameter" }, { status: 400 });

  const shopPattern = /^[a-zA-Z0-9][a-zA-Z0-9-_]*\.(myshopify\.com|shopify\.com|myshopify\.io|shop\.dev)$/;
  if (!shopPattern.test(shop)) return NextResponse.json({ error: "Invalid shop domain" }, { status: 400 });

  if (!process.env.SHOPIFY_API_KEY || !process.env.SHOPIFY_API_SECRET || !process.env.SESSION_SECRET) {
    return NextResponse.json({ error: "Missing app configuration" }, { status: 500 });
  }

  const state = buildState(shop);
  const redirectUri = new URL("/auth/callback", req.nextUrl.origin).toString();
  const authUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${process.env.SHOPIFY_API_KEY}` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}`;

  return NextResponse.redirect(authUrl);
}
