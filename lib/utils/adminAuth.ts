import { NextRequest } from "next/server";
import { verifyShop, COOKIE_NAME } from "@/lib/utils/standaloneSession";

/** Returns the authenticated shop for an admin API request, or null. */
export async function getAdminShop(req: NextRequest): Promise<string | null> {
  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  if (!cookie) return null;
  return verifyShop(cookie);
}
