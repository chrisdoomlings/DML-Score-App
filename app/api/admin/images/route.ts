import { NextRequest, NextResponse } from "next/server";
import { getAdminShop } from "@/lib/utils/adminAuth";
import { listShopImages } from "@/lib/utils/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const shop = await getAdminShop(req);
  if (!shop) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const images = await listShopImages(shop);
    return NextResponse.json({ images });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to list images";
    console.error("[admin/images GET]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
