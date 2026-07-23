// Simple in-memory rate limiter (per serverless instance). Good enough to
// blunt abuse of the public proxy endpoints; not a substitute for edge rules.
const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count += 1;
  if (hits.size > 10_000) hits.clear();
  return entry.count <= max;
}
