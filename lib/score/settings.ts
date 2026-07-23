import { getDb, jsonb } from "@/lib/supabase/client";
import { mergeMilestoneConfig, type MilestoneConfig } from "@/lib/score/milestones";

export interface ScoreSettings {
  pointsPerGame: number;
  milestones: MilestoneConfig;
  guessEnabled: boolean;
  guessPoints: number;
  guessGapMax: number; // max point gap between 1st and 2nd for a game to count as "close"
  guessEveryN: number; // offer the mini-game every Nth logged game per customer
}

const DEFAULTS = {
  pointsPerGame: 50,
  guessEnabled: true,
  guessPoints: 10,
  guessGapMax: 10,
  guessEveryN: 3,
};

export async function getSettings(shop: string): Promise<ScoreSettings> {
  const db = getDb();
  const rows = await db<
    {
      pointsPerGame: number;
      milestones: unknown;
      guessEnabled: boolean;
      guessPoints: number;
      guessGapMax: number;
      guessEveryN: number;
    }[]
  >`
    SELECT points_per_game AS "pointsPerGame",
           milestones,
           guess_enabled AS "guessEnabled",
           guess_points  AS "guessPoints",
           guess_gap_max AS "guessGapMax",
           guess_every_n AS "guessEveryN"
    FROM score_settings WHERE shop = ${shop}
  `;
  const r = rows[0];
  return {
    pointsPerGame: r?.pointsPerGame ?? DEFAULTS.pointsPerGame,
    milestones: mergeMilestoneConfig(r?.milestones),
    guessEnabled: r?.guessEnabled ?? DEFAULTS.guessEnabled,
    guessPoints: r?.guessPoints ?? DEFAULTS.guessPoints,
    guessGapMax: r?.guessGapMax ?? DEFAULTS.guessGapMax,
    guessEveryN: r?.guessEveryN ?? DEFAULTS.guessEveryN,
  };
}

export async function saveSettings(shop: string, s: Partial<ScoreSettings>): Promise<ScoreSettings> {
  const current = await getSettings(shop);
  const next: ScoreSettings = {
    pointsPerGame: clampInt(s.pointsPerGame ?? current.pointsPerGame, 0, 10_000),
    milestones: mergeMilestoneConfig(s.milestones ?? current.milestones),
    guessEnabled: typeof s.guessEnabled === "boolean" ? s.guessEnabled : current.guessEnabled,
    guessPoints: clampInt(s.guessPoints ?? current.guessPoints, 0, 10_000),
    guessGapMax: clampInt(s.guessGapMax ?? current.guessGapMax, 0, 9_999),
    guessEveryN: clampInt(s.guessEveryN ?? current.guessEveryN, 1, 100),
  };
  const db = getDb();
  await db`
    INSERT INTO score_settings (shop, points_per_game, milestones, guess_enabled, guess_points, guess_gap_max, guess_every_n, updated_at)
    VALUES (${shop}, ${next.pointsPerGame}, ${jsonb(next.milestones)}, ${next.guessEnabled}, ${next.guessPoints}, ${next.guessGapMax}, ${next.guessEveryN}, NOW())
    ON CONFLICT (shop) DO UPDATE SET
      points_per_game = EXCLUDED.points_per_game,
      milestones      = EXCLUDED.milestones,
      guess_enabled   = EXCLUDED.guess_enabled,
      guess_points    = EXCLUDED.guess_points,
      guess_gap_max   = EXCLUDED.guess_gap_max,
      guess_every_n   = EXCLUDED.guess_every_n,
      updated_at      = NOW()
  `;
  return next;
}

function clampInt(v: unknown, min: number, max: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}
