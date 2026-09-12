import { LATEST_API_VERSION, Session } from "@shopify/shopify-api";
import { sessionStorage } from "@/lib/supabase/sessionStore";

/**
 * Offline session lookup for server-to-server Admin API calls, distinct from
 * lib/utils/adminAuth.ts's getAdminShop() — that only verifies the embedded
 * app's App Bridge JWT to identify *which shop* is calling, it never touches
 * shopify_sessions or holds an access token. Callers that need to actually
 * call Shopify's Admin API (not just know the shop) load the offline session
 * separately, here.
 */
export async function getOfflineSession(shop: string): Promise<Session | null> {
  const session = await sessionStorage.loadSession(`offline_${shop}`);
  return session ?? null;
}

/** Checks a comma-separated OAuth scope string (Session.scope) for one scope. */
export function hasScope(session: Session | null, scope: string): boolean {
  if (!session?.scope) return false;
  return session.scope.split(",").map((s) => s.trim()).includes(scope);
}

/**
 * Raw Admin GraphQL call — a plain fetch rather than the full shopifyApi()
 * client, matching the hand-rolled-fetch style app/auth/callback/route.ts
 * already uses for OAuth token exchange. This app has no other Admin API call
 * site to justify constructing the heavier client object.
 */
export async function adminGraphql<T>(
  shop: string,
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<{ data?: T; errors?: unknown }> {
  const res = await fetch(`https://${shop}/admin/api/${LATEST_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`Admin GraphQL request failed: ${res.status}`);
  }
  return res.json();
}
