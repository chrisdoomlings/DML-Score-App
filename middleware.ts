import { NextRequest, NextResponse } from "next/server";

const SHOP_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9-_]*\.(myshopify\.com|shopify\.com|myshopify\.io|shop\.dev)$/;

export function middleware(req: NextRequest) {
  // Shopify Admin opens application_url ("/") with `host` on first load.
  // Route straight into the dashboard shell, preserving all query params.
  if (req.nextUrl.pathname === "/" && req.nextUrl.searchParams.get("host")) {
    const url = req.nextUrl.clone();
    url.pathname = "/app/dashboard";
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next();
  const shopParam = req.nextUrl.searchParams.get("shop");
  const shop = shopParam && SHOP_PATTERN.test(shopParam) ? shopParam : null;
  res.headers.set(
    "Content-Security-Policy",
    shop
      ? `frame-ancestors https://${shop} https://admin.shopify.com;`
      : `frame-ancestors 'none';`
  );
  return res;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
