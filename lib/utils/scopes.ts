/**
 * Single source of truth for the OAuth scope string, shared by app/auth/route.ts
 * (authorize redirect) and app/auth/callback/route.ts (fallback if Shopify's
 * token-exchange response omits `scope`). Must match [access_scopes].scopes in
 * shopify.app.dml-score.toml — Shopify doesn't grant more than the app's
 * registered scopes regardless of what's requested here, but a mismatch would
 * make an admin feature that checks a scope (e.g. the read_products-gated
 * collection picker) permanently think it's missing.
 */
export const SCOPES = "read_customers,read_products";
