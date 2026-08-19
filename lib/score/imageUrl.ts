// Shared by lib/score/settings.ts (theme images) and lib/score/achievements.ts
// (achievement icons) — split out to avoid a circular import between the two
// (settings.ts merges achievement config; achievements.ts sanitizes icon URLs).

// Only ever accept our own R2 public URL prefix or blank (clears back to default) —
// this value ends up interpolated into a CSS custom property and an <img src>, so
// don't let it become an arbitrary-origin/injection vector via a hand-crafted request.
export function sanitizeImageUrl(v: string): string {
  const trimmed = v.trim();
  if (!trimmed) return "";
  const publicBase = process.env.CLOUDFLARE_R2_PUBLIC_URL?.replace(/\/$/, "");
  if (publicBase && trimmed.startsWith(publicBase + "/")) return trimmed;
  return "";
}
