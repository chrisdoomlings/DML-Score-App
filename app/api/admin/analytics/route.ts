import { NextRequest, NextResponse } from "next/server";
import { getAdminShop } from "@/lib/utils/adminAuth";
import { getShopAnalytics } from "@/lib/score/games";
import { getProductAnalytics } from "@/lib/score/productAnalytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const shop = await getAdminShop(req);
  if (!shop) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [analytics, products] = await Promise.all([getShopAnalytics(shop), getProductAnalytics(shop)]);
  return NextResponse.json({ analytics: { ...analytics, products } });
}
