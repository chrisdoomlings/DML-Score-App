import { NextRequest, NextResponse } from "next/server";
import { getAdminShop } from "@/lib/utils/adminAuth";
import { listShopImages, deleteFromR2 } from "@/lib/utils/r2";

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

export async function DELETE(req: NextRequest) {
  const shop = await getAdminShop(req);
  if (!shop) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json().catch(() => null);
    const key = typeof body?.key === "string" ? body.key : "";
    // Uploaded object keys are always "${shop}/...' — enforcing that prefix
    // means a shop can never delete another shop's file even if it somehow
    // got hold of its key.
    if (!key || !key.startsWith(`${shop}/`)) {
      return NextResponse.json({ error: "Invalid image key" }, { status: 400 });
    }
    await deleteFromR2(key);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to delete image";
    console.error("[admin/images DELETE]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
