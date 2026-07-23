import postgres from "postgres";

function getDb() {
  const g = globalThis as unknown as { __scoreDb?: postgres.Sql };
  if (!g.__scoreDb) {
    const url = process.env.SUPABASE_DATABASE_URL;
    if (!url) throw new Error("SUPABASE_DATABASE_URL is not set");
    g.__scoreDb = postgres(url, { max: 5, idle_timeout: 20 });
  }
  return g.__scoreDb;
}

// Wraps db.json() with a safe cast — postgres's JSONValue type is strict but
// all our JSONB columns hold plain JSON-serializable data at runtime.
function jsonb(value: unknown) {
  return getDb().json(value as postgres.JSONValue);
}

export { getDb, jsonb };
