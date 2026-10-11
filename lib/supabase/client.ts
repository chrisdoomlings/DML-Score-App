import postgres from "postgres";

function getDb() {
  const g = globalThis as unknown as { __scoreDb?: postgres.Sql };
  if (!g.__scoreDb) {
    const url = process.env.SUPABASE_DATABASE_URL;
    if (!url) throw new Error("SUPABASE_DATABASE_URL is not set");
    // Supabase's transaction-mode pooler (port 6543) doesn't support
    // prepared statements, so they must be off there; session mode (5432)
    // keeps them. 6543 is what works for local dev on networks where the
    // 5432 handshake stalls — production is unchanged.
    const transactionPooler = /:6543\//.test(url);
    g.__scoreDb = postgres(url, { max: 5, idle_timeout: 20, ...(transactionPooler ? { prepare: false } : {}) });
  }
  return g.__scoreDb;
}

// Wraps db.json() with a safe cast — postgres's JSONValue type is strict but
// all our JSONB columns hold plain JSON-serializable data at runtime.
function jsonb(value: unknown) {
  return getDb().json(value as postgres.JSONValue);
}

export { getDb, jsonb };
