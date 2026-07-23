import { getDb } from "./client";

export interface ShopRecord {
  id: string;
  installedAt: string | null;
  uninstalledAt: string | null;
}

export async function getShop(shop: string): Promise<ShopRecord | null> {
  const db = getDb();
  const rows = await db<ShopRecord[]>`
    SELECT id, installed_at AS "installedAt", uninstalled_at AS "uninstalledAt"
    FROM shops WHERE id = ${shop}
  `;
  return rows[0] ?? null;
}

export async function saveShop(
  shop: string,
  data: { installedAt?: string | null; uninstalledAt?: string | null }
) {
  const db = getDb();
  await db`
    INSERT INTO shops (id, installed_at, uninstalled_at)
    VALUES (${shop}, ${data.installedAt ?? null}, ${data.uninstalledAt ?? null})
    ON CONFLICT (id) DO UPDATE SET
      installed_at   = COALESCE(EXCLUDED.installed_at, shops.installed_at),
      uninstalled_at = EXCLUDED.uninstalled_at
  `;
}
