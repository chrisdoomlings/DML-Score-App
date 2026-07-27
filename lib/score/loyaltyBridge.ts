import crypto from "crypto";
import { getDb } from "@/lib/supabase/client";

/**
 * Phase 3 loyalty bridge: pushes a single score_points_ledger row to Reviews &
 * Rewards as a 1:1 loyalty point credit, live, right after it's earned.
 *
 * Ships as a no-op until LOYALTY_BRIDGE_URL/SECRET are set — those only exist
 * once Reviews & Rewards has the receiving endpoint built (see the contract
 * below). This side never blocks a game/guess save on the bridge call: callers
 * schedule it via next/server's `after()` so it runs post-response.
 *
 * Contract expected on the Reviews & Rewards side (built there, separately):
 *   POST <LOYALTY_BRIDGE_URL>
 *   Headers: Content-Type: application/json; X-Score-Signature: hex HMAC-SHA256
 *            of the raw request body, keyed with LOYALTY_BRIDGE_SECRET (shared).
 *   Body:    { shop, customerId, points, reason, externalId }
 *   - `externalId` is this ledger row's UUID — Reviews & Rewards must treat it
 *     as an idempotency key (unique constraint on it) so retries never double-credit.
 *   - Response 2xx = credited (or already credited for a repeat externalId).
 *     Anything else is treated as failure and retried on a later pass.
 */

const BRIDGE_URL = process.env.LOYALTY_BRIDGE_URL;
const BRIDGE_SECRET = process.env.LOYALTY_BRIDGE_SECRET;

export interface BridgePayload {
  shop: string;
  customerId: string;
  ledgerId: string;
  points: number;
  reason: string;
}

export async function pushToLoyaltyBridge(payload: BridgePayload): Promise<void> {
  if (!BRIDGE_URL || !BRIDGE_SECRET) return; // bridge not wired up yet

  const db = getDb();
  const body = JSON.stringify({
    shop: payload.shop,
    customerId: payload.customerId,
    points: payload.points,
    reason: payload.reason,
    externalId: payload.ledgerId,
  });
  const signature = crypto.createHmac("sha256", BRIDGE_SECRET).update(body).digest("hex");

  try {
    const res = await fetch(BRIDGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Score-Signature": signature },
      body,
    });
    if (res.ok) {
      await db`UPDATE score_points_ledger SET synced_at = NOW(), sync_error = NULL WHERE id = ${payload.ledgerId}`;
    } else {
      await db`
        UPDATE score_points_ledger
        SET sync_attempts = sync_attempts + 1, sync_error = ${`HTTP ${res.status}`}
        WHERE id = ${payload.ledgerId}
      `;
    }
  } catch (err) {
    await db`
      UPDATE score_points_ledger
      SET sync_attempts = sync_attempts + 1, sync_error = ${String(err instanceof Error ? err.message : err)}
      WHERE id = ${payload.ledgerId}
    `;
  }
}
