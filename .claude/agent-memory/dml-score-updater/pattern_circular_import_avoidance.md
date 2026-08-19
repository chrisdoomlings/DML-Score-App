---
name: pattern_circular_import_avoidance
description: lib/score/settings.ts and lib/score/achievements.ts both need sanitizeImageUrl — it lives in a neutral lib/score/imageUrl.ts to avoid a two-way import cycle
type: project
---

`lib/score/settings.ts` merges `score_settings.achievements` JSONB via
`mergeAchievementConfig()` (imported from `lib/score/achievements.ts`), and
`achievements.ts` needs to sanitize each achievement's `iconUrl` the same way
`settings.ts` sanitizes theme image URLs. Originally `sanitizeImageUrl()` lived as an
unexported helper inside `settings.ts`, which would have forced achievements.ts to import
FROM settings.ts — creating a real two-way runtime import cycle (not the safe type-only
kind already used between `games.ts` and the old `milestones.ts` via `import type`).

**Why:** Two-way runtime cycles between ES modules are usually fine in Next.js/webpack as
long as neither side calls the other at top-level module-eval time, but it's fragile and
easy to break by accident later. Splitting shared leaf utilities out is cheap insurance.

**How to apply:** `sanitizeImageUrl()` now lives in `lib/score/imageUrl.ts` (a small,
dependency-free leaf module) and both `settings.ts` and `achievements.ts` import from
there. Keep this pattern for any future helper that both a "config merge" module and a
"config consumer" module need — extract to a leaf file rather than importing across the
two. The existing `games.ts` <-> `achievements.ts`/`settings.ts` type-only import
(`import type { GamePlayer } from "@/lib/score/games"` in achievements.ts) is fine as-is
since type-only imports are erased at compile time and can't cause a runtime cycle.
