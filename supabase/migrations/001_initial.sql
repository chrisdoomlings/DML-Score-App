-- DML Score — initial schema
-- Run against the DEDICATED DML Score Supabase project only.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Shopify OAuth session storage
CREATE TABLE IF NOT EXISTS shopify_sessions (
  id         TEXT PRIMARY KEY,
  content    TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Installed shops
CREATE TABLE IF NOT EXISTS shops (
  id             TEXT PRIMARY KEY,
  installed_at   TIMESTAMPTZ,
  uninstalled_at TIMESTAMPTZ
);

-- Per-shop settings (points values)
CREATE TABLE IF NOT EXISTS score_settings (
  shop            TEXT PRIMARY KEY,
  points_per_game INTEGER NOT NULL DEFAULT 50,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Completed games. customer_id is the logged-in Shopify customer who logged
-- the game (null for guests). players holds the full scoring breakdown.
CREATE TABLE IF NOT EXISTS score_games (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop         TEXT NOT NULL,
  customer_id  TEXT,
  played_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  player_count INTEGER NOT NULL,
  winner_names JSONB NOT NULL DEFAULT '[]'::jsonb,
  top_score    INTEGER NOT NULL,
  customer_won BOOLEAN NOT NULL DEFAULT FALSE,
  players      JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_score_games_shop_customer
  ON score_games (shop, customer_id, played_at DESC);
CREATE INDEX IF NOT EXISTS idx_score_games_shop_played
  ON score_games (shop, played_at DESC);

-- Phase-1 points ledger (own tally; bridged to the loyalty program in a later
-- phase — the ledger keeps the full history so a migration can backfill).
CREATE TABLE IF NOT EXISTS score_points_ledger (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop        TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  points      INTEGER NOT NULL,
  reason      TEXT NOT NULL,
  game_id     UUID REFERENCES score_games (id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_score_points_shop_customer
  ON score_points_ledger (shop, customer_id);
