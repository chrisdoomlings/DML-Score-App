-- DML Score — achievements rebuild: replaces the points/milestones ledger
-- entirely with a 20-item, admin-editable achievements system.
-- Run against the DEDICATED DML Score Supabase project only.
-- Pre-launch app — no backward compatibility needed, safe to drop freely.

-- Every unlock is a single row; idempotency comes from the unique constraint
-- below + ON CONFLICT DO NOTHING at the call site (mirrors the ledger's old
-- partial-unique-index trick from 002_milestones_guess.sql, generalized to
-- "any key, once per customer" instead of one-off partial indexes per key).
CREATE TABLE IF NOT EXISTS score_achievements_unlocked (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop             TEXT NOT NULL,
  customer_id      TEXT NOT NULL,
  achievement_key  TEXT NOT NULL,
  unlocked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  game_id          UUID REFERENCES score_games (id) ON DELETE SET NULL,
  UNIQUE (shop, customer_id, achievement_key)
);
CREATE INDEX IF NOT EXISTS idx_score_achievements_shop_customer
  ON score_achievements_unlocked (shop, customer_id);

-- Self-reported profile data used by novelty achievements (birthday today;
-- named generically so a future `location` column can slot in for
-- geotargeting without a schema rewrite).
CREATE TABLE IF NOT EXISTS score_customer_profile (
  shop        TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  birthday    DATE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (shop, customer_id)
);

-- Needed to evaluate first_game_mobile/first_game_desktop and the
-- calendar-date/streak achievements using the player's own local date
-- (captured client-side at save time — avoids needing shop/customer
-- timezone data we don't have).
ALTER TABLE score_games
  ADD COLUMN IF NOT EXISTS device_type          TEXT CHECK (device_type IN ('mobile', 'desktop')),
  ADD COLUMN IF NOT EXISTS played_at_local_date  DATE;

-- Achievement config (enabled/name/description/iconUrl per key) lives in one
-- JSONB blob, same pattern as the old `milestones` column — but this time it
-- carries name/description/iconUrl too, so the admin can edit copy without a
-- code change (fixes the old MILESTONE_LABELS hardcoded-duplication anti-pattern).
ALTER TABLE score_settings
  ADD COLUMN IF NOT EXISTS achievements JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Points system fully decommissioned this pass. The guess *offer* mechanic
-- survives (guess_enabled/guess_gap_max/guess_every_n stay); only the payout
-- goes.
ALTER TABLE score_settings
  DROP COLUMN IF EXISTS milestones,
  DROP COLUMN IF EXISTS points_per_game,
  DROP COLUMN IF EXISTS guess_points;

DROP TABLE IF EXISTS score_points_ledger;
