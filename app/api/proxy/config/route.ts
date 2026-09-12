import { NextRequest, NextResponse } from "next/server";
import { getVerifiedProxyParams } from "@/lib/utils/appProxy";
import { getSettings } from "@/lib/score/settings";
import { getRecommendedProducts } from "@/lib/score/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-cache, no-store" };

export async function GET(req: NextRequest) {
  const params = getVerifiedProxyParams(req.nextUrl.searchParams, process.env.SHOPIFY_API_SECRET!);
  if (!params) return NextResponse.json({ error: "Invalid signature" }, { status: 403, headers: HEADERS });

  const shop = params.shop;
  if (!shop) return NextResponse.json({ error: "Missing shop" }, { status: 400, headers: HEADERS });

  try {
    const settings = await getSettings(shop);
    const images = Object.fromEntries(
      Object.entries(settings.images).filter(([, url]) => url)
    );
    const products = await getRecommendedProducts(shop, settings);
    return NextResponse.json(
      {
        loggedIn: Boolean(params.logged_in_customer_id),
        images,
        showProducts: settings.showProducts && products.length > 0,
        productsHeading: settings.productsHeading,
        productsNote: settings.productsNote,
        products,
        tipText: settings.tipText,
        homeHeading: settings.homeHeading,
        homeSubheading: settings.homeSubheading,
        discordUrl: settings.discordUrl,
        winnerFooterUrl: settings.winnerFooterUrl,
        trophyHeading: settings.trophyHeading,
        trophySubheading: settings.trophySubheading,
        trophyTagline: settings.trophyTagline,
        trophyActionsBg: settings.trophyActionsBg,
        steps: settings.steps,
        trophyTopImages: settings.trophyTopImages,
        logoWidth: settings.logoWidth,
        cardMinHeight: settings.cardMinHeight,
        modalWidth: settings.modalWidth,
        modalHeight: settings.modalHeight,
        modalHeightUnit: settings.modalHeightUnit,
        lockPageScroll: settings.lockPageScroll,
        layoutMode: settings.layoutMode,
        winnerImageSize: settings.winnerImageSize,
        charactersWidth: settings.charactersWidth,
        headingWidth: settings.headingWidth,
        headingFontSize: settings.headingFontSize,
      },
      { headers: HEADERS }
    );
  } catch (err) {
    console.error("[proxy/config GET]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500, headers: HEADERS });
  }
}
