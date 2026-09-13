import { NextRequest, NextResponse } from "next/server";
import { getAdminShop } from "@/lib/utils/adminAuth";
import { getGamesPage } from "@/lib/score/games";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

/** GET /api/admin/games?page=0 — paginated full-shop game history for the
 *  admin "All games" page (dashboard's "Recent games" only shows the latest 6). */
export async function GET(req: NextRequest) {
  const shop = await getAdminShop(req);
  if (!shop) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const page = Math.max(0, Number(req.nextUrl.searchParams.get("page") ?? "0") || 0);
    const { games, total } = await getGamesPage(shop, PAGE_SIZE, page * PAGE_SIZE);
    return NextResponse.json({ games, total, page, pageSize: PAGE_SIZE });
  } catch (err) {
    console.error("[admin/games GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
