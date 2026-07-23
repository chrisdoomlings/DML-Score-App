import { NextRequest } from "next/server";
import { verifySessionToken } from "@/lib/utils/sessionToken";

/** Returns the authenticated shop for an admin API request, or null. */
export async function getAdminShop(req: NextRequest): Promise<string | null> {
  return verifySessionToken(req.headers.get("authorization"));
}
