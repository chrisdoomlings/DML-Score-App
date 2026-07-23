import { NextRequest, NextResponse } from "next/server";
import { getAdminShop } from "@/lib/utils/adminAuth";
import { getShopSummary } from "@/lib/score/games";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const shop = await getAdminShop(req);
  if (!shop) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const summary = await getShopSummary(shop);
  return NextResponse.json({ shop, ...summary });
}
