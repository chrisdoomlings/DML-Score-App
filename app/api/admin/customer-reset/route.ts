import { NextRequest, NextResponse } from "next/server";
import { getAdminShop } from "@/lib/utils/adminAuth";
import { resetCustomerData } from "@/lib/score/games";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/admin/customer-reset — wipes one customer's games, unlocked
 *  achievements, and profile (birthday) for this shop. Irreversible; used
 *  from the admin Games page for support/test-account resets. */
export async function POST(req: NextRequest) {
  const shop = await getAdminShop(req);
  if (!shop) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const customerId = typeof body.customerId === "string" ? body.customerId.trim() : "";
    if (!customerId || customerId.length > 60) {
      return NextResponse.json({ error: "Invalid customerId" }, { status: 400 });
    }

    const result = await resetCustomerData(shop, customerId);
    if (result.gamesDeleted === 0 && result.achievementsDeleted === 0 && result.profileDeleted === 0) {
      return NextResponse.json({ error: "No data found for that customer ID" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[admin/customer-reset POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
