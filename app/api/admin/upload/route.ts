import { NextRequest, NextResponse } from "next/server";
import { getAdminShop } from "@/lib/utils/adminAuth";
import { uploadToR2 } from "@/lib/utils/r2";
import { IMAGE_KEYS, type ImageKey } from "@/lib/score/settings";
import { ACHIEVEMENT_KEYS, type AchievementKey } from "@/lib/score/achievements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// Achievement icons use a namespaced key (e.g. "achievement:first_game_ever")
// instead of joining the fixed IMAGE_KEYS tuple — there are 20 of them and
// they're stored in score_settings.achievements[key].iconUrl, not a dedicated
// column, so they don't belong in that allowlist. Validated against the same
// AchievementKey union the achievement engine uses, not a duplicated list.
const ACHIEVEMENT_PREFIX = "achievement:";

// The trophy screen's top illustration is a POOL (score_settings.trophy_top_images,
// an array), not a single named slot — every upload for it just appends, so
// unlike the achievement icons there's no per-item key to validate, only this
// one fixed literal.
const TROPHY_POOL_KEY = "trophyTopPool";

type ResolvedKey =
  | { kind: "setting"; key: ImageKey }
  | { kind: "achievement"; key: AchievementKey }
  | { kind: "trophyPool" };

function resolveImageKey(raw: string): ResolvedKey | null {
  if (raw === TROPHY_POOL_KEY) return { kind: "trophyPool" };
  if (raw.startsWith(ACHIEVEMENT_PREFIX)) {
    const suffix = raw.slice(ACHIEVEMENT_PREFIX.length);
    if ((ACHIEVEMENT_KEYS as string[]).includes(suffix)) {
      return { kind: "achievement", key: suffix as AchievementKey };
    }
    return null;
  }
  if ((IMAGE_KEYS as readonly string[]).includes(raw)) {
    return { kind: "setting", key: raw as ImageKey };
  }
  return null;
}

export async function POST(req: NextRequest) {
  const shop = await getAdminShop(req);
  if (!shop) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const imageKeyRaw = String(formData.get("imageKey") || "");

    const resolved = resolveImageKey(imageKeyRaw);
    if (!resolved) {
      return NextResponse.json({ error: "Invalid image key" }, { status: 400 });
    }
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    const ext = ALLOWED_TYPES[file.type];
    if (!ext) {
      return NextResponse.json({ error: "Only JPEG, PNG, or WebP images are allowed" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 400 });
    }

    const storageSlug =
      resolved.kind === "achievement" ? `achievement-${resolved.key}` :
      resolved.kind === "trophyPool" ? "trophy-top-pool" :
      resolved.key;
    const key = `${shop}/${storageSlug}-${Date.now()}.${ext}`;
    const url = await uploadToR2(Buffer.from(bytes), key, file.type);

    return NextResponse.json({ url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upload failed";
    console.error("[admin/upload]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
