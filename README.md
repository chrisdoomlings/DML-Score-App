# DML Score

Doomlings score tool as a Shopify app — the rebuild of scoredoomlings.com / doomlingsscore.com
that lives on doomlings.com (e.g. `/pages/score`) instead of an external domain.

**Fully independent app**: its own Shopify app registration, its own Vercel project, its own
Supabase database. It shares nothing with DML Reviews & Rewards, DML Scavenger, or any other app.

## What it does

- **Score flow** (theme app extension): players → World's End → Face Value → Bonus →
  expansion points → winner reveal. Stepper inputs (no minus-key problem), scores survive
  page refresh (localStorage), correct n-way tie handling.
- **Customer accounts**: logged-in customers get automatic game history, wins, best score,
  and earn points per logged game (own ledger, phase 1 — bridged to the loyalty program later).
- **Guests**: full tool works; a "create account to save your victory" prompt shows at the
  winner screen.
- **Product recommendations**: winner screen shows up to 3 products from a collection the
  merchant picks in the theme editor (e.g. "Score Page Picks") with one-tap add to cart.
- **Client art & copy (May 2026 spec)**: mobile-first screens with the updated Doomlings
  backgrounds, character art on the welcome and winner screens, and the requested language
  ("Enter everyone's names!", "REMATCH!", expansion-points wording, etc.).

## Stack

Same pattern as DML Scavenger: Next.js App Router + `@shopify/shopify-api` (OAuth) +
`postgres` to Supabase + Shopify App Proxy (`/apps/score` → `/api/proxy/*`) + theme app extension.

## Go-live steps

1. **Register the app** in the Shopify Partner Dashboard (new app, not an existing one).
   Copy `client_id` and API secret into `shopify.app.dml-score.toml` and `.env`.
2. **Create a NEW Supabase project** (do not reuse another app's project).
   Run `supabase/migrations/001_initial.sql` against it. Put the session-pooler URL in `.env`.
3. `cp .env.example .env` and fill in all values.
4. `npm install`
5. **Create a new Vercel project** pointing at this folder; set the same env vars.
6. In the Partner Dashboard, configure the **App Proxy**: prefix `apps`, subpath `score`,
   URL `https://<your-vercel-domain>/api/proxy`.
7. `shopify app dev --config shopify.app.dml-score.toml` to test locally.
8. Deploy the extension: `shopify app deploy --config shopify.app.dml-score.toml`
   (run manually — never from automation).
9. Install on the store, then in the theme editor add the **Doomlings Score Tool** block to a
   new page template (create `/pages/score`), pick the recommendations collection, save.
10. Point scoredoomlings.com and doomlingsscore.com at the new page with 301 redirects.

## Admin

`https://<app-domain>/` → enter shop domain → OAuth → `/app/dashboard`:
points per game, activity summary.

## Phase 2 — milestones + mini-game (built July 2026)

- **Milestone rewards**: server-evaluated in `lib/score/milestones.ts` from validated
  game data, awarded in `saveGame` as one ledger row per milestone (idempotent via
  unique partial indexes, migration 002). Config-driven per shop (toggles / points /
  thresholds in the admin dashboard) using the client's example values as defaults:
  first game +10, a player scores 60+ +10, 5–6 players +10, 10+ Meaning of Life +10.
  `drop_of_life_50_plus` exists but ships **disabled** — "Drop of Life" points are
  entered inside the Bonus step (mixed with suppressed traits), so the rule needs
  client confirmation before enabling. When the formal milestone list arrives it's a
  settings change, not code.
- **"Guess Who Won?" mini-game**: offered before the reveal when ALL of: customer
  logged in, close game (1st-vs-2nd gap ≤ `guess_gap_max`, not an all-way tie), and
  it's the customer's every-`guess_every_n`-th logged game — all checked server-side
  in `saveGame`. When offered, the game response withholds `winnerNames` and the
  storefront shows the guess screen; POST `/apps/score/guess` claims the one allowed
  guess atomically (`guess_name IS NULL` guard on the game row, 30-min window) and
  awards `guess_points` on a correct pick. Skipping or offline just reveals normally.
  Still needs: a fun program name from the client.

## Phase 3 (not built yet)

- Loyalty bridge: an endpoint in Reviews & Rewards to convert the `score_points_ledger`
  into real loyalty points (single additive change there, done separately and carefully).
- Customer metafields (expansion ownership signals for marketing segments).
- Card-aware scoring (pick actual trait cards; the app computes the score).

## Removed

- **Survey** (removed July 2026 at client request — "not important, spend the time on
  the tool"). It existed through commit history if ever wanted back.
