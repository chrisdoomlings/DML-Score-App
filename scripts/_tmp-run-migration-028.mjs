import postgres from "postgres";
import { readFileSync } from "node:fs";

const envPath = "c:/shopify apps dml/DML Score App/.env.prodcution.local";
const env = readFileSync(envPath, "utf8");
const match = env.match(/^SUPABASE_DATABASE_URL=(.+)$/m);
if (!match) throw new Error("SUPABASE_DATABASE_URL not found in env file");
const url = match[1].trim().replace(/^["']|["']$/g, "");

const sqlPath = "c:/shopify apps dml/DML Score App/supabase/migrations/028_layout_mode.sql";
const sql = readFileSync(sqlPath, "utf8");

const db = postgres(url, { max: 1 });
try {
  await db.unsafe(sql);
  const check = await db`
    SELECT column_name, data_type, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'score_settings' AND column_name = 'layout_mode'
  `;
  console.log("Migration applied. Column info:", check);
} finally {
  await db.end({ timeout: 5 });
}
