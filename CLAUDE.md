# DML Score — Shopify App

## What this is
A **fully independent** Shopify app for the Doomlings score tool (rebuild of doomlingsscore.com
onto doomlings.com). Cloned architecturally from DML Scavenger. **Zero connection to DML
Reviews & Rewards** — never touch that repo from here; it is the client's critical production app.

## Stack
- **Next.js App Router**
- **`@shopify/shopify-api` v11** — OAuth + session management
- **`postgres` npm package** — direct PostgreSQL to a DEDICATED Supabase project
- **Admin auth via Shopify App Bridge session tokens (JWT)** — `lib/utils/adminAuth.ts` + `lib/utils/sessionToken.ts`, verified with `SHOPIFY_API_SECRET` (constant-time HMAC, `exp`/`nbf`/`aud`/`iss`/`dest` all checked)
- **Shopify App Proxy** — `apps/score` (storefront) → `/api/proxy/*` (server)
- Admin UI is plain React (no Polaris) — one dashboard page.

## Layout
- OAuth: `app/auth/` + `app/auth/callback/` (scope: `read_customers`)
- Proxy API: `app/api/proxy/` — `config` (GET), `game` (POST), `stats` (GET)
- Admin API: `app/api/admin/` — `settings`, `summary`, `analytics`, `upload` (App Bridge JWT-authed via `lib/utils/adminAuth.ts`)
- Webhooks: `app/api/webhooks/` — `app/uninstalled`
- Business logic: `lib/score/` — `games.ts` (save/stats), `settings.ts`
- DB: `lib/supabase/client.ts` + `supabase/migrations/001_initial.sql` (5 tables, all `score_`-prefixed except sessions/shops)
- Theme extension: `extensions/score-tool/` — block + `dmls-`prefixed assets (CSS namespaced under `#dmls-root`)

## Key design decisions
- **Points are a local ledger** (`score_points_ledger`), NOT wired to the Reviews & Rewards
  loyalty program in phase 1. A later bridge migrates/mirrors them. Do not call other apps' APIs.
- **Guests can log games** (no points, no customer_id); customers are identified only via
  `logged_in_customer_id` injected by Shopify's app proxy — never trust a client-sent id.
- **Product recommendations are Liquid-rendered** from a collection block setting — no API needed;
  the merchant curates them in Shopify admin.
- **Survey was removed at client request (July 2026)** — don't rebuild it; the client wants
  effort on the tool itself. Recoverable from git history if they change their mind.
- **Mobile-first is a client requirement** — ~99% of traffic is phones at the game table.
  The base layout is the 520px single column; desktop is the media-query exception.

## Critical rules (never violate)
- **Never run `git add` / `git commit` / `git push`** without explicit user request
- **Never run `shopify app deploy`** — the user deploys manually with `--config shopify.app.dml-score.toml`
- **Never point `SUPABASE_DATABASE_URL` at another app's database**

## `shopify.app.dml-score.toml` — the `[events]` block is a dead stub, not a feature
Shopify CLI (confirmed on 4.6.1 and 4.7.0, August 2026) fails `app deploy` with
`[events]: Required` unless a `[[events.subscription]]` is present, even though this app
doesn't use Shopify Events (a separate, developer-preview system from `[webhooks]`) at all.
The `topic = "Customer"` subscription in that block exists only to satisfy that validation
bug — `"Customer"` was picked specifically because it's covered by the `read_customers`
scope already declared, so it didn't require requesting a new one. It's not wired to
anything; `uri` points at the existing `app/api/webhooks` handler, which already no-ops on
any topic other than `app/uninstalled`. Safe to remove this block entirely once Shopify
fixes the CLI bug upstream — don't mistake it for a real integration in the meantime.

## Database tables
`shopify_sessions`, `shops`, `score_settings`, `score_games`, `score_points_ledger`

## App Proxy routes
| Storefront URL | Server route | Purpose |
|---|---|---|
| `/apps/score/config` | `/api/proxy/config` | Settings (public) |
| `/apps/score/game` | `/api/proxy/game` | POST save completed game (+achievements if customer; may offer guess) |
| `/apps/score/guess` | `/api/proxy/guess` | POST one-shot "Guess Who Won?" claim (customer only, no reward) |
| `/apps/score/achievements` | `/api/proxy/achievements` | GET customer achievements + game history |
| `/apps/score/profile` | `/api/proxy/profile` | POST self-reported birthday (for the "Birthdoom" achievement) |

## Phase 3 notes (achievements rebuild, replacing points/milestones, August 2026)
- **Points/milestones/loyalty-bridge system removed entirely** (`lib/score/milestones.ts`,
  `lib/score/loyaltyBridge.ts`, `score_points_ledger` table all deleted — see
  `supabase/migrations/010_achievements.sql`). No point values are tracked anywhere;
  `drop_of_life_50_plus` and every other old milestone rule went with it — there is no
  equivalent achievement today, that decision would need to be made fresh if revisited.
- Achievements: `lib/score/achievements.ts`, 21 fixed `AchievementKey`s (20 original +
  `gencon`, added Aug 2026 — venue/date-window geofence around Indianapolis during Gen
  Con week, opt-in browser geolocation only prompted during that ~4-day window, lat/lng
  never persisted). Only
  `enabled`/`name`/`description`/`iconUrl` are admin-configurable (`score_settings.achievements`
  JSONB merged over `DEFAULT_ACHIEVEMENTS` via `mergeAchievementConfig`) — trigger
  thresholds/conditions are NOT configurable, they're fixed in code. `name` is always
  visible on a tile; `description` is player-facing and only shown once unlocked (locked
  tiles show "??????" instead). Awards are rows in `score_achievements_unlocked`;
  idempotency = `UNIQUE (shop, customer_id, achievement_key)` + `ON CONFLICT DO NOTHING`
  in `saveGame()`. Guests (no `customer_id`) can log games but never unlock achievements.
- Guess eligibility (close game + every-Nth + logged-in) is decided server-side in
  `saveGame`; the one-guess-per-game claim is the atomic UPDATE in
  `app/api/proxy/guess/route.ts`. It no longer pays out anything — it's a cosmetic
  mini-game only. Honest-player note: scores are entered client-side, so the
  reveal-withholding is UX, not security.
- The entire storefront tool now opens as a single full-screen modal (`#dmls-modal` in
  `extensions/score-tool/assets/dmls-score.js`) launched from a button on the page,
  rather than rendering inline — this covers every screen, not just Achievements.
