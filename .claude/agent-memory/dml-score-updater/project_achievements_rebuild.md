---
name: project_achievements_rebuild
description: Points/milestones replaced by 20-item achievements system; Phases 1-5 done (backend + theme extension), Phase 6 (admin settings UI) still pending
metadata:
  type: project
---

The DML Score app's points/milestones/loyalty-ledger system was fully
decommissioned (pre-launch app, no backward-compat needed) and replaced with
a 20-item **Achievements** system per the client's plan at
`C:\Users\Lenovo\.claude\plans\unified-hugging-cherny.md`.

**Why:** client requested points/DOOM-points/wins/highest-score stats be
replaced with fixed, name-revealed-only-on-unlock achievements, plus a
History tab, a full-screen modal treatment for the whole tool (not just
stats), a player-self-removal bug fix, green button glow removal, and
copy/layout rewrites across the welcome/add-names/4-scoring-step screens
(see [[pattern_achievement_idempotency]], [[pattern_circular_import_avoidance]]).

**Status as of 2026-08-19:**
- Phase 1 (migration `010_achievements.sql`), Phase 2 (`lib/score/achievements.ts`),
  Phase 3 (`lib/score/games.ts` saveGame/getCustomerAchievements/getCustomerHistory
  rewrite), Phase 4 (proxy routes: `achievements`, `profile`, `game`, `guess`,
  `config`) — all done in prior sessions, verified still current as of this session.
- **Phase 5 (theme extension rebuild) — done this session.** Full rewrite of
  `extensions/score-tool/assets/dmls-score.js` (~1000 lines) and
  `dmls-score.css`, plus `extensions/score-tool/blocks/score-tool.liquid`.
  Structural change: the whole app (welcome through winner, plus
  Achievements/History) now lives inside a `#dmls-modal` overlay appended to
  `document.body` at boot (same pattern as the pre-existing
  `#dmls-toast`/`#dmls-confetti` nodes) — `#dmls-root` on the page is now
  just a small launcher button/card, not the app itself. `view` var
  ("game"|"achv") is a new top-level dispatch alongside `state.screen`; hash
  scheme extended with a non-screen "achievements" hash entry.
  Also fixed: the "remove myself as player" bug via `state.customerOptedOut`,
  removed `.dmls-btn-go`'s green box-shadow glow, bumped player cap 8→12
  (no cap advertised in UI), full copy rewrite of Add Names + all 4 scoring
  steps, bee/fish animated welcome characters sourced from
  `settings.images.beeNormal/beeHover/fishNormal/fishHover`, per-step
  flanking character placeholder slots (no real art yet — scaffolding only,
  `data-char-slot="<stepKey>-left/right"` convention for future art).
- **Phase 6 (admin settings UI, `app/app/settings/page.tsx`) — still
  pending.** Note: `lib/score/settings.ts` and `app/api/admin/upload/route.ts`
  already support achievement icon uploads and bee/fish image keys at the
  DB/API level (confirmed by reading `settings.ts`'s `IMAGE_KEYS` during
  Phase 5 work) — what's unconfirmed/unverified is whether the actual React
  settings page UI has been wired up to edit them. Verify current state of
  `app/app/settings/page.tsx` before assuming Phase 6 is fully outstanding.

**How to apply:** when picking up further work on this app, re-read the
actual current files before trusting this summary — it's a snapshot, not a
live status.
