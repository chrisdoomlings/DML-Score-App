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

## Database tables
`shopify_sessions`, `shops`, `score_settings`, `score_games`, `score_points_ledger`

## App Proxy routes
| Storefront URL | Server route | Purpose |
|---|---|---|
| `/apps/score/config` | `/api/proxy/config` | Settings (public) |
| `/apps/score/game` | `/api/proxy/game` | POST save completed game (+points/milestones if customer; may offer guess) |
| `/apps/score/guess` | `/api/proxy/guess` | POST one-shot "Guess Who Won?" claim (customer only) |
| `/apps/score/stats` | `/api/proxy/stats` | GET customer history/points |

## Phase 2 notes (milestones + Guess Who Won, July 2026)
- Milestones: `lib/score/milestones.ts`, config in `score_settings.milestones` JSONB
  merged over `DEFAULT_MILESTONES`. Awards are ledger rows; idempotency = unique
  partial indexes from `supabase/migrations/002_milestones_guess.sql` + `ON CONFLICT
  DO NOTHING`. `drop_of_life_50_plus` ships disabled pending client rule confirmation.
- Guess eligibility (close game + every-Nth + logged-in) is decided server-side in
  `saveGame`; the one-guess-per-game claim is the atomic UPDATE in
  `app/api/proxy/guess/route.ts`. Honest-player note: scores are entered client-side,
  so the reveal-withholding is UX, not security — the security boundary is that
  awards only come from server-checked, once-per-game ledger writes.
