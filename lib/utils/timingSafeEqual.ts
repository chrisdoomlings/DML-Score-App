import crypto from "crypto";

export function safeEqualBuffers(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  return crypto.timingSafeEqual(a, b);
}

export function safeEqualHex(a: string, b: string): boolean {
  return safeEqualBuffers(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
