import { NextRequest, NextResponse } from "next/server";
import { getAdminShop } from "@/lib/utils/adminAuth";
import { getOfflineSession, hasScope, adminGraphql } from "@/lib/utils/adminGraphql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLLECTIONS_QUERY = `
  query ListCollections($search: String) {
    collections(first: 50, query: $search) {
      edges { node { id title handle } }
    }
  }
`;

interface CollectionsResponse {
  collections: { edges: { node: { id: string; title: string; handle: string } }[] };
}

/** GET /api/admin/collections?q=... — powers the Settings → Products collection
 *  picker. Requires the read_products scope, added after this app's original
 *  read_customers-only launch; a shop that installed before that needs to
 *  re-approve via /auth before this route can do anything for them. */
export async function GET(req: NextRequest) {
  const shop = await getAdminShop(req);
  if (!shop) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = await getOfflineSession(shop);
  if (!session || !hasScope(session, "read_products")) {
    return NextResponse.json({ error: "reauth_required", shop }, { status: 403 });
  }

  try {
    const q = req.nextUrl.searchParams.get("q") || "";
    const result = await adminGraphql<CollectionsResponse>(
      shop,
      session.accessToken!,
      COLLECTIONS_QUERY,
      { search: q ? `title:*${q}*` : null }
    );
    if (result.errors || !result.data) {
      console.error("[admin/collections GET] GraphQL errors", result.errors);
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
    const collections = result.data.collections.edges.map((e) => e.node);
    return NextResponse.json({ collections });
  } catch (err) {
    console.error("[admin/collections GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
