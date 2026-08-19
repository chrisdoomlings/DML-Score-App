---
name: pattern_achievement_idempotency
description: How the 20-key achievements engine (lib/score/achievements.ts) decides "first time" semantics and what's config-editable vs. fixed
type: project
---

`lib/score/achievements.ts` (replaces the deleted `lib/score/milestones.ts`) evaluates 20
fixed `AchievementKey`s every time a logged-in customer saves a game. It deliberately does
**not** query "has this already been unlocked" — `evaluateSingleGameAchievements()` /
`evaluateAchievements()` just report which keys are config-enabled AND condition-true for
*this* game, every single time.

**Why:** The actual "only unlock once ever" enforcement is the DB's
`UNIQUE (shop, customer_id, achievement_key)` constraint on `score_achievements_unlocked`
plus `ON CONFLICT DO NOTHING` in `saveGame()` (`lib/score/games.ts`) — this mirrors the old
milestone ledger's partial-unique-index trick from `002_milestones_guess.sql`, generalized
to one constraint covering all 20 keys instead of one-off partial indexes per key. Keeping
the evaluator pure/stateless (no "already unlocked" query) is simpler and cheaper than
doing the idempotency check twice.

**How to apply:** Unlike the old `MilestoneConfig` (which had per-key `points` and
`threshold` fields, admin-editable), the new `AchievementConfig`
(`Record<AchievementKey, {enabled, name, description, iconUrl}>`) has **no configurable
thresholds** — all 20 trigger conditions (score>50, gap>30, exactly-N-players, etc.) are
hardcoded in `evaluateSingleGameAchievements()`. Only enabled/name/description/iconUrl are
admin-editable via `score_settings.achievements` JSONB. If the client later asks to make a
threshold configurable, that's a schema/type change to `AchievementDef`, not just a settings
tweak.

Two async checks (`evaluateStreak`, `evaluateBirthday`) need DB access and run after the
`score_games` row is already inserted — `saveGame()` calls `evaluateAchievements()` AFTER
the `INSERT INTO score_games`, so the streak/birthday queries can see the just-saved game's
own `played_at_local_date` as part of the trailing-7-day window.

Guests (`customerId === null`) get zero achievements — the evaluator is skipped entirely,
matching the old `if (customerId)` guard pattern from `saveGame()`.
