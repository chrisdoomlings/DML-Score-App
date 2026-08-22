-- DML Score — admin-editable Discord invite URL for the winner-screen
-- "Join us on Discord" banner (dashboard Settings, same convention as
-- home_heading/tip_text: empty string = banner hidden).
-- Run against the DEDICATED DML Score Supabase project only.

ALTER TABLE score_settings
  ADD COLUMN IF NOT EXISTS discord_url TEXT NOT NULL DEFAULT '';
