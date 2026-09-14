import { NextRequest, NextResponse } from "next/server";
import { getAdminShop } from "@/lib/utils/adminAuth";
import { getCustomersPage } from "@/lib/score/games";
import { getCustomerNames } from "@/lib/score/customerNames";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

/** GET /api/admin/customers?page=0 — paginated list of every customer_id
 *  that has logged a game in this shop, newest-active first, for the admin
 *  "Customers" page. Enriched with each customer's real Shopify name/email
 *  via one batched Admin GraphQL call — score_games only ever stores the
 *  bare customer_id, never a name, so without this the page would have
 *  nothing but numeric IDs to show. That lookup degrades gracefully (empty
 *  names, not a failed request) if the shop's offline session is missing or
 *  somehow lacks read_customers. */
export async function GET(req: NextRequest) {
  const shop = await getAdminShop(req);
  if (!shop) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const page = Math.max(0, Number(req.nextUrl.searchParams.get("page") ?? "0") || 0);
    const { customers, total } = await getCustomersPage(shop, PAGE_SIZE, page * PAGE_SIZE);
    const names = await getCustomerNames(shop, customers.map((c) => c.customerId));
    const enriched = customers.map((c) => ({
      ...c,
      displayName: names[c.customerId]?.displayName ?? null,
      email: names[c.customerId]?.email ?? null,
    }));
    return NextResponse.json({ customers: enriched, total, page, pageSize: PAGE_SIZE });
  } catch (err) {
    console.error("[admin/customers GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
