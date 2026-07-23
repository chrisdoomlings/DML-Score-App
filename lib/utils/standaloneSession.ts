export const COOKIE_NAME = "dmlscore_shop";
export const STANDALONE_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24;

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET environment variable is not set");
  }
  return secret;
}

async function getKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function hmac(data: string): Promise<string> {
  const key = await getKey();
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string) {
  if (!/^[a-f0-9]+$/i.test(hex) || hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function verifyHmac(data: string, signatureHex: string): Promise<boolean> {
  const signature = hexToBytes(signatureHex);
  if (!signature) return false;
  const key = await getKey();
  return crypto.subtle.verify("HMAC", key, signature, new TextEncoder().encode(data));
}

export async function signShop(shop: string): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + STANDALONE_SESSION_MAX_AGE_SECONDS;
  const payload = `${shop}|${expiresAt}`;
  const sig = await hmac(payload);
  return `${payload}|${sig}`;
}

export async function verifyShop(value: string): Promise<string | null> {
  const parts = value.split("|");
  if (parts.length !== 3) return null;
  const [shop, expiresAtRaw, sig] = parts;
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return null;
  const payload = `${shop}|${expiresAtRaw}`;
  return (await verifyHmac(payload, sig)) ? shop : null;
}
