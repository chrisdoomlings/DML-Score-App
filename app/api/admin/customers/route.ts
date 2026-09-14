import { NextRequest, NextResponse } from "next/server";
import { getAdminShop } from "@/lib/utils/adminAuth";
import { getCustomersPage } from "@/lib/score/games";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

/** GET /api/admin/customers?page=0 — paginated list of every customer_id
 *  that has logged a game in this shop, newest-active first, for the admin
 *  "Customers" page. */
export async function GET(req: NextRequest) {
  const shop = await getAdminShop(req);
  if (!shop) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const page = Math.max(0, Number(req.nextUrl.searchParams.get("page") ?? "0") || 0);
    const { customers, total } = await getCustomersPage(shop, PAGE_SIZE, page * PAGE_SIZE);
    return NextResponse.json({ customers, total, page, pageSize: PAGE_SIZE });
  } catch (err) {
    console.error("[admin/customers GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
