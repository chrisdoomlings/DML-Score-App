-- DML Score — phase 2: milestone rewards + "Guess Who Won?" mini-game
-- Run against the DEDICATED DML Score Supabase project only.

-- Milestone config lives in one JSONB blob (rules evolve as the client finalizes
-- the list); guess settings are plain columns like points_per_game.
ALTER TABLE score_settings
  ADD COLUMN IF NOT EXISTS milestones    JSONB   NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS guess_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS guess_points  INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS guess_gap_max INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS guess_every_n INTEGER NOT NULL DEFAULT 3;

-- One guess per game, recorded on the game row itself so a wrong guess can't be
-- retried (the guess_name IS NULL guard in the UPDATE makes claiming atomic).
ALTER TABLE score_games
  ADD COLUMN IF NOT EXISTS guess_offered BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS guess_name    TEXT,
  ADD COLUMN IF NOT EXISTS guess_correct BOOLEAN;

-- Idempotency: a given award reason can only exist once per game, and the
-- first-game milestone only once per customer, no matter how requests retry.
CREATE UNIQUE INDEX IF NOT EXISTS uq_score_ledger_game_reason
  ON score_points_ledger (game_id, reason) WHERE game_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_score_ledger_first_game
  ON score_points_ledger (shop, customer_id) WHERE reason = 'milestone_first_game';
