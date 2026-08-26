import { NextRequest, NextResponse } from "next/server";
import { getAdminShop } from "@/lib/utils/adminAuth";
import { getSettings, saveSettings } from "@/lib/score/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const shop = await getAdminShop(req);
  if (!shop) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const settings = await getSettings(shop);
    return NextResponse.json({ settings });
  } catch (err) {
    console.error("[admin/settings GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const shop = await getAdminShop(req);
  if (!shop) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const settings = await saveSettings(shop, {
      achievements: body.achievements,
      steps: body.steps,
      trophyTopImages: body.trophyTopImages,
      guessEnabled: body.guessEnabled,
      guessGapMax: body.guessGapMax,
      guessEveryN: body.guessEveryN,
      images: body.images,
      tipText: body.tipText,
      homeHeading: body.homeHeading,
      homeSubheading: body.homeSubheading,
      discordUrl: body.discordUrl,
      trophyHeading: body.trophyHeading,
      trophySubheading: body.trophySubheading,
      trophyTagline: body.trophyTagline,
      trophyActionsBg: body.trophyActionsBg,
      logoWidth: body.logoWidth,
      cardMinHeight: body.cardMinHeight,
      winnerImageSize: body.winnerImageSize,
      charactersWidth: body.charactersWidth,
      headingWidth: body.headingWidth,
      headingFontSize: body.headingFontSize,
    });
    return NextResponse.json({ settings });
  } catch (err) {
    console.error("[admin/settings POST]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
