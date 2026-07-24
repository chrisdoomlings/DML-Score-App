import { NextRequest, NextResponse } from "next/server";
import { getAdminShop } from "@/lib/utils/adminAuth";
import { getSettings, saveSettings } from "@/lib/score/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const shop = await getAdminShop(req);
  if (!shop) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const settings = await getSettings(shop);
  return NextResponse.json({ settings });
}

export async function POST(req: NextRequest) {
  const shop = await getAdminShop(req);
  if (!shop) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const settings = await saveSettings(shop, {
      pointsPerGame: body.pointsPerGame,
      milestones: body.milestones,
      guessEnabled: body.guessEnabled,
      guessPoints: body.guessPoints,
      guessGapMax: body.guessGapMax,
      guessEveryN: body.guessEveryN,
      images: body.images,
    });
    return NextResponse.json({ settings });
  } catch (err) {
    console.error("[admin/settings POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
