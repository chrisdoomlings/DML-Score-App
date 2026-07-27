-- Phase 3: tracks whether each ledger row has been pushed to the Reviews &
-- Rewards loyalty bridge. Additive only — never touches Reviews & Rewards' own schema.
ALTER TABLE score_points_ledger
  ADD COLUMN IF NOT EXISTS synced_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sync_error    TEXT;

CREATE INDEX IF NOT EXISTS idx_score_points_unsynced
  ON score_points_ledger (shop)
  WHERE synced_at IS NULL;
