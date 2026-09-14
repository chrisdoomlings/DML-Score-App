import { getOfflineSession, hasScope, adminGraphql } from "@/lib/utils/adminGraphql";

export interface CustomerName {
  displayName: string | null;
  email: string | null;
}

const CUSTOMER_NAMES_QUERY = `
  query CustomerNames($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Customer {
        id
        displayName
        email
      }
    }
  }
`;

interface CustomerNamesResponse {
  nodes: ({ id: string; displayName: string; email: string | null } | null)[];
}

/** Looks up real Shopify names/emails for a batch of customer_ids (as stored
 *  in score_games — plain numeric strings, not GIDs) via one Admin GraphQL
 *  `nodes` call. Used by the admin Customers page, which otherwise only has
 *  the bare numeric customer_id to show — this app never stores a
 *  customer's name or email itself. read_customers has been part of this
 *  app's scope since its original launch (unlike read_products, added later
 *  — see 003_custom_images.sql-era Phase 4 notes), so no re-auth prompt is
 *  needed here; a shop with no offline session or somehow missing that
 *  scope just falls back to an empty map, and the caller shows the bare
 *  customer_id instead of failing the whole page. */
export async function getCustomerNames(shop: string, customerIds: string[]): Promise<Record<string, CustomerName>> {
  if (!customerIds.length) return {};

  const session = await getOfflineSession(shop);
  if (!session?.accessToken || !hasScope(session, "read_customers")) return {};

  try {
    const ids = customerIds.map((id) => `gid://shopify/Customer/${id}`);
    const result = await adminGraphql<CustomerNamesResponse>(shop, session.accessToken, CUSTOMER_NAMES_QUERY, { ids });
    if (result.errors || !result.data) {
      console.error("[getCustomerNames] GraphQL errors", result.errors);
      return {};
    }
    const out: Record<string, CustomerName> = {};
    for (const node of result.data.nodes) {
      if (!node) continue;
      const numericId = node.id.split("/").pop();
      if (numericId) out[numericId] = { displayName: node.displayName || null, email: node.email };
    }
    return out;
  } catch (err) {
    console.error("[getCustomerNames]", err);
    return {};
  }
}
