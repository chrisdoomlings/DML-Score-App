import { Session } from "@shopify/shopify-api";
import { getDb } from "./client";

interface SessionStorage {
  storeSession(session: Session): Promise<boolean>;
  loadSession(id: string): Promise<Session | undefined>;
  deleteSession(id: string): Promise<boolean>;
  deleteSessions(ids: string[]): Promise<boolean>;
  findSessionsByShop(shop: string): Promise<Session[]>;
}

export const sessionStorage: SessionStorage = {
  async storeSession(session: Session): Promise<boolean> {
    const db = getDb();
    await db`
      INSERT INTO shopify_sessions (id, content, updated_at)
      VALUES (${session.id}, ${JSON.stringify(session.toPropertyArray())}, NOW())
      ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()
    `;
    return true;
  },

  async loadSession(id: string): Promise<Session | undefined> {
    const db = getDb();
    const rows = await db<{ content: string }[]>`
      SELECT content FROM shopify_sessions WHERE id = ${id}
    `;
    if (!rows.length) return undefined;
    const props = JSON.parse(rows[0].content) as [string, string | boolean | number][];
    return Session.fromPropertyArray(props);
  },

  async deleteSession(id: string): Promise<boolean> {
    const db = getDb();
    await db`DELETE FROM shopify_sessions WHERE id = ${id}`;
    return true;
  },

  async deleteSessions(ids: string[]): Promise<boolean> {
    if (!ids.length) return true;
    const db = getDb();
    await db`DELETE FROM shopify_sessions WHERE id = ANY(${ids})`;
    return true;
  },

  async findSessionsByShop(shop: string): Promise<Session[]> {
    const db = getDb();
    const rows = await db<{ id: string; content: string }[]>`
      SELECT id, content FROM shopify_sessions WHERE id LIKE ${"%" + shop + "%"}
    `;
    return rows
      .filter((r) => r.id.includes(shop))
      .map((r) => {
        const props = JSON.parse(r.content) as [string, string | boolean | number][];
        return Session.fromPropertyArray(props);
      });
  },
};
