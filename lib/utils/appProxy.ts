import crypto from "crypto";
import { safeEqualHex } from "@/lib/utils/timingSafeEqual";

/**
 * Verifies a Shopify App Proxy request signature.
 * All query params (except `signature`) are sorted, joined as key=value pairs,
 * and HMAC-SHA256 signed with the API secret.
 */
export function verifyProxySignature(
  params: Record<string, string>,
  apiSecret: string
): boolean {
  const { signature, ...rest } = params;
  if (!signature || !apiSecret) return false;

  const message = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join("&");

  const digest = crypto.createHmac("sha256", apiSecret).update(message).digest("hex");
  return safeEqualHex(digest, signature);
}

/**
 * Extracts and verifies proxy request params from a request URL.
 * Returns null if the signature is invalid or missing.
 */
export function getVerifiedProxyParams(
  searchParams: URLSearchParams,
  apiSecret: string
): Record<string, string> | null {
  const params: Record<string, string> = {};
  searchParams.forEach((v, k) => { params[k] = v; });
  return verifyProxySignature(params, apiSecret) ? params : null;
}
