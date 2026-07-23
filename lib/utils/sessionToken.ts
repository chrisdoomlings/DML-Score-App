import crypto from "crypto";
import { safeEqualBuffers } from "@/lib/utils/timingSafeEqual";

const CLOCK_SKEW_SECONDS = 10;
const SHOP_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9-_]*\.(myshopify\.com|shopify\.com|myshopify\.io|shop\.dev)$/;

/** Verifies a Shopify App Bridge session token (JWT) and returns the shop domain, or null. */
export function verifySessionToken(authHeader: string | null): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;

  const secret = process.env.SHOPIFY_API_SECRET;
  const apiKey = process.env.SHOPIFY_API_KEY;
  if (!secret || !apiKey) return null;

  let providedSig: Buffer;
  try {
    providedSig = Buffer.from(sigB64, "base64url");
  } catch {
    return null;
  }
  const expectedSig = crypto.createHmac("sha256", secret).update(`${headerB64}.${payloadB64}`).digest();
  if (!safeEqualBuffers(expectedSig, providedSig)) return null;

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const exp = Number(payload.exp);
  const nbf = Number(payload.nbf);
  if (!Number.isFinite(exp) || exp < now - CLOCK_SKEW_SECONDS) return null;
  if (!Number.isFinite(nbf) || nbf > now + CLOCK_SKEW_SECONDS) return null;
  if (payload.aud !== apiKey) return null;

  const dest = String(payload.dest ?? "").replace(/^https:\/\//, "");
  const iss = String(payload.iss ?? "");
  if (!dest || !iss.startsWith(`https://${dest}`)) return null;
  if (!SHOP_PATTERN.test(dest)) return null;

  return dest;
}
