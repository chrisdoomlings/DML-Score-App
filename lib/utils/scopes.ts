/**
 * Single source of truth for the OAuth scope string, shared by app/auth/route.ts
 * (authorize redirect) and app/auth/callback/route.ts (fallback if Shopify's
 * token-exchange response omits `scope`). Must match [access_scopes].scopes in
 * shopify.app.dml-score.toml — Shopify doesn't grant more than the app's
 * registered scopes regardless of what's requested here, but a mismatch would
 * make an admin feature that checks a scope (e.g. the read_products-gated
 * collection picker) permanently think it's missing.
 *
 * read_orders: needed for Shopify to deliver the orders/paid webhook
 * (app/api/webhooks/route.ts) that backs product-order/revenue attribution
 * (lib/score/productAnalytics.ts) — added alongside read_products in the same
 * "existing installs must re-approve" bucket; a shop that hasn't re-approved
 * since this shipped simply won't have orders/paid delivered for it yet.
 */
export const SCOPES = "read_customers,read_products,read_orders";
