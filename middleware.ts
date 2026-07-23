import { NextRequest, NextResponse } from "next/server";
import { verifyShop, COOKIE_NAME } from "@/lib/utils/standaloneSession";

export async function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/app")) {
    const cookie = req.cookies.get(COOKIE_NAME)?.value;
    const shop = cookie ? await verifyShop(cookie) : null;
    if (!shop) {
      const loginUrl = new URL("/", req.url);
      loginUrl.searchParams.set("redirect", req.nextUrl.pathname);
      return NextResponse.redirect(loginUrl);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*"],
};
