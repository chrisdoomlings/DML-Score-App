---
name: project_achievements_rebuild
description: Points/milestones system was fully decommissioned and replaced with a 20-item achievements system (backend done 2026-08-19; frontend/admin UI still pending)
type: project
---

The client requested the entire points/DOOM-points/milestones system be replaced with a
fixed 20-item **Achievements** system (name/icon revealed only once unlocked, admin-editable
copy). This was driven by a full plan at `C:\Users\Lenovo\.claude\plans\unified-hugging-cherny.md`
("Achievements Rebuild + Modal UX + Player Removal + Glow Removal").

**Why:** App is pre-launch, so no backward compatibility was needed — the points ledger,
loyalty bridge (`lib/score/loyaltyBridge.ts`), and `lib/score/milestones.ts` were deleted
outright rather than deprecated. Guess Who Won? survives as a mechanic but its points payout
was removed (not wired into achievements).

**How to apply:** Phases 1-4 (DB migration, achievement engine, `saveGame()` rewrite, proxy
routes) are DONE as of 2026-08-19 — see `supabase/migrations/010_achievements.sql` and
`lib/score/achievements.ts`. Phases 5-6 (theme extension modal rebuild in
`extensions/score-tool/`, and admin UI in `app/app/settings/page.tsx`) are explicit
**follow-up work, not yet started** — don't assume the storefront or admin settings page
reflects the new achievements system yet. `app/app/settings/page.tsx` still has its own local
`Settings`/`MilestoneRule` TypeScript interfaces (decoupled from `lib/score/settings.ts`'s
`ScoreSettings`) referencing the now-removed `pointsPerGame`/`milestones`/`guessPoints`
fields — it will compile (own local types) but is functionally stale until Phase 6.
`extensions/score-tool/assets/dmls-score.js` still POSTs to the old `/apps/score/stats`
endpoint (now renamed to `/apps/score/achievements`) and expects the old response shape —
the live storefront will not work correctly for the stats/achievements screen until Phase 5
ships. This is expected/known, not a regression to fix reactively.

See also [[pattern_circular_import_avoidance]] and [[pattern_achievement_idempotency]].
