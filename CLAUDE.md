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
- OAuth: `app/auth/` + `app/auth/callback/` (scope: `read_customers,read_products,read_orders`,
  shared constant in `lib/utils/scopes.ts`)
- Proxy API: `app/api/proxy/` — `config` (GET), `game` (POST), `stats` (GET), `product-click` (POST)
- Admin API: `app/api/admin/` — `settings`, `summary`, `analytics`, `upload`, `collections`
  (App Bridge JWT-authed via `lib/utils/adminAuth.ts`; `collections` additionally needs the
  shop's offline session to carry `read_products`, via `lib/utils/adminGraphql.ts`)
- Webhooks: `app/api/webhooks/` — `app/uninstalled`, `orders/paid`
- Business logic: `lib/score/` — `games.ts` (save/stats), `settings.ts`, `productAnalytics.ts`
  (add-to-cart clicks + order/revenue attribution)
- DB: `lib/supabase/client.ts` + `supabase/migrations/001_initial.sql` (5 tables, all `score_`-prefixed except sessions/shops)
- Theme extension: `extensions/score-tool/` — block + `dmls-`prefixed assets (CSS namespaced under `#dmls-root`)

## Key design decisions
- **Points are a local ledger** (`score_points_ledger`), NOT wired to the Reviews & Rewards
  loyalty program in phase 1. A later bridge migrates/mirrors them. Do not call other apps' APIs.
- **Guests can log games** (no points, no customer_id); customers are identified only via
  `logged_in_customer_id` injected by Shopify's app proxy — never trust a client-sent id.
- **Product recommendations are admin-configured, JS-rendered** (moved off Liquid in
  September 2026 — see the Phase 4 note below). The merchant picks the collection from
  Settings → Winner → "Recommended products", not the theme editor.
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
| `/apps/score/game` | `/api/proxy/game` | POST save completed game (+achievements if customer) |
| `/apps/score/achievements` | `/api/proxy/achievements` | GET customer achievements + game history |
| `/apps/score/profile` | `/api/proxy/profile` | POST self-reported birthday (for the "Birthdoom" achievement) |

## Phase 3 notes (achievements rebuild, replacing points/milestones, August 2026)
- **Points/milestones/loyalty-bridge system removed entirely** (`lib/score/milestones.ts`,
  `lib/score/loyaltyBridge.ts`, `score_points_ledger` table all deleted — see
  `supabase/migrations/010_achievements.sql`). No point values are tracked anywhere;
  `drop_of_life_50_plus` and every other old milestone rule went with it — there is no
  equivalent achievement today, that decision would need to be made fresh if revisited.
- Achievements: `lib/score/achievements.ts`, 21 fixed `AchievementKey`s. A Gen Con
  geofence achievement (venue/date-window around Indianapolis, browser geolocation)
  was tried and then removed (Aug 2026) — swapped back out for the originally-planned
  `st_patricks` ("Pot 'O Gold", Mar 17 local date), which is a plain date check like
  christmas/valentines/halloween. No geolocation code remains anywhere in the app;
  don't reintroduce it without asking. Only
  `enabled`/`name`/`description`/`iconUrl` are admin-configurable (`score_settings.achievements`
  JSONB merged over `DEFAULT_ACHIEVEMENTS` via `mergeAchievementConfig`) — trigger
  thresholds/conditions are NOT configurable, they're fixed in code. `name` is always
  visible on a tile; `description` is player-facing and only shown once unlocked (locked
  tiles show "??????" instead). Awards are rows in `score_achievements_unlocked`;
  idempotency = `UNIQUE (shop, customer_id, achievement_key)` + `ON CONFLICT DO NOTHING`
  in `saveGame()`. Guests (no `customer_id`) can log games but never unlock achievements.
- **"Guess Who Won?" mini-game removed entirely (September 2026)** — it used to detour
  before the reveal on close games, every Nth logged game, for logged-in customers only
  (no payout even before removal, just a reveal-timing novelty). Removed front-to-back:
  `renderGuess()` and all `guessResult`/`guessOffered` state in `dmls-score.js`, the
  `app/api/proxy/guess` route (deleted), the close-game/every-Nth eligibility check in
  `saveGame()`, the guess settings section in the admin Settings page, and the guess
  stats card in Analytics. `POST /apps/score/game` now always returns `winnerNames`/
  `topScore` immediately — it no longer ever withholds them. The
  `score_games.guess_offered/guess_name/guess_correct` and
  `score_settings.guess_enabled/guess_gap_max/guess_every_n` DB columns were left in
  place (unused, not dropped) rather than migrated away — ask before writing a migration
  to drop them.
- The storefront tool renders entirely inline in the page (September 2026) — reverting
  the earlier full-screen-modal rebuild. Every screen (welcome, Add Names, scoring
  steps, winner, Achievements/History, trophy) lives in normal page flow inside
  `#dmls-root`; `#dmls-welcome-page` is the welcome screen and `#dmls-modal` (a legacy
  id/name only — it is not an overlay) is the panel right after it that shows
  everything else, toggled via `showModal()`/`hideModal()` in
  `extensions/score-tool/assets/dmls-score.js`. No backdrop, fixed positioning, or
  body-scroll-lock. One consequence: the trophy screen's old "actions only appear
  once you scroll past the trophy art" effect relied on the modal's fixed viewport
  height and no longer applies — it now flows straight into the actions.
  **Screen size is fixed, not capped (September 2026)** — Settings → General →
  "Screen size" (admin field still named `modalHeight`/`modalHeightUnit`/`modalWidth`
  in code/DB) sets the actual width/height of the panel in both inline and classic
  full-screen-modal display mode, not just an upper bound: every `.dmls-card` under
  `#dmls-root` has both `height` and `max-height` set to that value (`min-height: 0`
  is still there, but is now moot since height is explicit) — welcome no longer
  shrinks to fit short content, it fills the configured box like every other screen
  always did. `.dmls-launcher` (the welcome wrapper) uses `width: min(100%,
  var(--dmls-modal-width, 520px))` instead of a hardcoded 520px, matching
  `#dmls-modal`. Content that doesn't fit scrolls inside via `.dmls-scroll-mid` (Add
  Names/steps/achievements) or `.dmls-card-body` directly (welcome/winner/trophy).
  `loadConfig()` sets `--dmls-modal-height`/`--dmls-modal-width` on `#dmls-root` itself
  (not just the `#dmls-modal` panel) so welcome is sized identically to every other
  screen. The classic full-screen modal (`body > #dmls-modal .dmls-modal-card`) already
  worked this way before this change — `width`/`height` (not just `max-height`) were
  already explicit there; this change brought inline mode in line with it.

## Phase 4 note (recommended-products widget moves off Liquid, September 2026)
- The winner-screen recommended-products widget's settings (show/hide, which collection,
  heading, note) used to be a `collection`-type Liquid block setting, editable only in the
  theme editor. They now live in the app's own Settings → Winner → "Recommended products"
  section instead, matching how most other content already worked. Liquid has no way to read
  the app's Postgres-backed settings at render time, so this required a real architecture
  change, not just moving fields around:
  - **New OAuth scope**: `read_products`, added to `read_customers` (shared constant
    `lib/utils/scopes.ts`, used by both `app/auth/route.ts` and `app/auth/callback/route.ts`).
    This is the app's first-ever Admin API call of any kind. **Every shop that installed
    before this shipped must re-approve the app** (visit `/auth?shop=<shop>` again) before
    the collection picker or product fetching will work for them — there's no way around
    Shopify's re-consent requirement when a scope is added. Until they do, `read_products`
    is simply absent from their stored session's scope string.
  - `lib/utils/adminGraphql.ts`: `getOfflineSession()` (loads the shop's offline session from
    `lib/supabase/sessionStore.ts`, distinct from `lib/utils/adminAuth.ts#getAdminShop()`
    which only verifies the embedded app's JWT and never touches an access token),
    `hasScope()`, and `adminGraphql()` — a raw `fetch` to Admin GraphQL, not the full
    `shopifyApi()` client object, consistent with this app's hand-rolled OAuth in
    `app/auth/callback/route.ts`.
  - `app/api/admin/collections/route.ts`: lists collections for the Settings picker; returns
    `{ error: "reauth_required", shop }` (403) if the stored session lacks `read_products` —
    the Settings page shows a "Reconnect the app" link (`/auth?shop=...`, `target="_top"`
    since OAuth can't run inside the embedded iframe) rather than failing silently.
  - `lib/score/products.ts`: resolves the chosen collection's first 3 products via Admin
    GraphQL, cached in `score_settings.products_cache`/`products_cache_at` (15 min TTL) so
    `/apps/score/config` doesn't hit the Admin API on every storefront page load; falls back
    to a stale cache rather than an empty widget if a live fetch fails. Cache is invalidated
    in `saveSettings()` whenever `recsCollectionId` changes.
  - `extensions/score-tool/blocks/score-tool.liquid` no longer has `show_products`/
    `recs_collection`/`products_heading`/`products_note` schema settings, and `#dmls-products`
    is now a bare container — `renderProducts()` in `dmls-score.js` populates it client-side
    from `/apps/score/config`'s `products`/`showProducts`/`productsHeading`/`productsNote`
    fields. **Any store where these were customized in the theme editor lost that
    customization** — it must be re-entered in the app Settings page, theme editor values are
    no longer read at all.
  - The "Shop more" link the old Liquid version had (linking to the collection's own page)
    was dropped rather than carried over initially — resolving it would've meant
    fetching+caching the collection's handle/URL alongside the product list, not just
    re-plumbing existing data. **Re-added later in September 2026**: `lib/score/products.ts`'s
    Admin GraphQL query now also fetches the collection `handle`, and `getRecommendedProducts()`
    returns `{ products, collectionUrl }` — `collectionUrl` rides the same
    `products_cache`/TTL/invalidation as the product list (no schema change needed, the column
    was already JSONB). Exposed as `productsCollectionUrl` on `/apps/score/config`, rendered by
    `renderProducts()` in `dmls-score.js` as `.dmls-btn.dmls-btn-ghost-revert.dmls-prod-more`
    (same markup the pre-Phase-4 Liquid version used, styling since changed to
    `dmls-btn-ghost-revert` and the `dmls-btn-full` width modifier dropped) — hidden when empty.
    No theme editor or Liquid changes; the link is entirely a byproduct of whichever collection
    the merchant already picks in Settings.

## Phase 5 note (product click + order/revenue attribution, September 2026)
- New "Recommended products" card on the admin Analytics page: how many times the winner-screen
  widget's "add to cart" button is tapped, and how many of those taps turn into a paid order —
  two independent counts populated by two very different paths.
  - **Clicks** (`score_product_clicks`, `lib/score/productAnalytics.ts#logProductClick`): logged
    synchronously the instant a `/cart/add.js` call succeeds, via a new proxy route
    `POST /apps/score/product-click` (`app/api/proxy/product-click/route.ts`) called
    fire-and-forget from `winnerClicks()` in `dmls-score.js`. Always known immediately; not tied
    to checkout ever completing. A lost beacon just undercounts by one.
  - **Orders/revenue** (`score_attributed_orders`,
    `lib/score/productAnalytics.ts#recordAttributedOrder`): populated by a new `orders/paid`
    webhook (`app/api/webhooks/route.ts`), not `orders/create` — cancelled/unpaid orders never
    count toward revenue. Attribution works by tagging: every `/cart/add.js` call from the widget
    now sets a `_dml_score_source: "recommended_products"` line-item property (underscore-
    prefixed properties are hidden from the customer-facing cart UI by Shopify themes, so this is
    invisible to the shopper). The webhook handler sums quantity/revenue only across line items
    carrying that property, not the whole order — a cart mixing widget and non-widget items
    doesn't overstate attribution. Insert is `ON CONFLICT (shop, order_id) DO NOTHING` since
    `orders/paid` can redeliver.
  - **New OAuth scope**: `read_orders`, added to the shared `lib/utils/scopes.ts` constant
    (`read_customers,read_products,read_orders`) — required for Shopify to actually deliver the
    `orders/paid` webhook at all, same "every installed shop must re-approve" situation as
    `read_products` in Phase 4. Until a shop re-approves (`/auth?shop=<shop>`), no `orders/paid`
    events arrive for it and only click counts show up in Analytics, never orders/revenue.
  - `supabase/migrations/032_product_analytics.sql`: adds both tables, `score_-`prefixed like
    everything else. Multi-currency shops get a per-currency revenue breakdown
    (`revenueByCurrency`) rather than one summed total, since summing across currencies would be
    meaningless.
  - No admin-configurable settings for this feature — it's pure reporting, nothing to turn off
    or tune from Settings.
