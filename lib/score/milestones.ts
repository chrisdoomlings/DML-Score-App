import type { GamePlayer } from "@/lib/score/games";

/**
 * Milestone rules — server-evaluated from validated game data only.
 * Point values / thresholds are per-shop config (score_settings.milestones JSONB
 * merged over DEFAULT_MILESTONES); the client's formal milestone list can be
 * applied as a settings change without code changes.
 */

export interface MilestoneRule {
  enabled: boolean;
  points: number;
  threshold?: number;
}

export type MilestoneKey =
  | "first_game"
  | "score_60_plus"
  | "players_5_6"
  | "meaning_10_plus"
  | "drop_of_life_50_plus";

export type MilestoneConfig = Record<MilestoneKey, MilestoneRule>;

export const DEFAULT_MILESTONES: MilestoneConfig = {
  first_game: { enabled: true, points: 10 },
  score_60_plus: { enabled: true, points: 10, threshold: 60 },
  players_5_6: { enabled: true, points: 10 },
  meaning_10_plus: { enabled: true, points: 10, threshold: 10 },
  // "Drop of Life" points are entered as part of the Bonus step (drops of life
  // + suppressed traits share the bp field), so bp >= threshold is only an
  // approximation. Disabled until the client confirms the exact rule.
  drop_of_life_50_plus: { enabled: false, points: 10, threshold: 50 },
};

export const MILESTONE_LABELS: Record<MilestoneKey, string> = {
  first_game: "First game logged!",
  score_60_plus: "A player scored 60+ points",
  players_5_6: "Played with 5–6 players",
  meaning_10_plus: "10+ Meaning of Life bonus points",
  drop_of_life_50_plus: "50+ Drop of Life points",
};

export interface MilestoneAward {
  key: MilestoneKey;
  label: string;
  points: number;
}

/** Ledger reason for a milestone key (stable — used by unique indexes). */
export function milestoneReason(key: MilestoneKey): string {
  return "milestone_" + key;
}

export function evaluateMilestones(
  players: GamePlayer[],
  gamesLoggedBefore: number,
  config: MilestoneConfig
): MilestoneAward[] {
  const awards: MilestoneAward[] = [];
  const hit = (key: MilestoneKey, ok: boolean) => {
    const rule = config[key];
    if (rule?.enabled && rule.points > 0 && ok) {
      awards.push({ key, label: MILESTONE_LABELS[key], points: rule.points });
    }
  };

  hit("first_game", gamesLoggedBefore === 0);
  hit("score_60_plus", players.some((p) => p.total >= (config.score_60_plus.threshold ?? 60)));
  hit("players_5_6", players.length === 5 || players.length === 6);
  hit("meaning_10_plus", players.some((p) => p.mp >= (config.meaning_10_plus.threshold ?? 10)));
  hit("drop_of_life_50_plus", players.some((p) => p.bp >= (config.drop_of_life_50_plus.threshold ?? 50)));

  return awards;
}

/** Merge stored JSONB (possibly partial/stale keys) over the defaults. */
export function mergeMilestoneConfig(stored: unknown): MilestoneConfig {
  const out = {} as MilestoneConfig;
  const src = (typeof stored === "object" && stored !== null ? stored : {}) as Record<string, Partial<MilestoneRule>>;
  for (const key of Object.keys(DEFAULT_MILESTONES) as MilestoneKey[]) {
    const d = DEFAULT_MILESTONES[key];
    const s = src[key] ?? {};
    out[key] = {
      enabled: typeof s.enabled === "boolean" ? s.enabled : d.enabled,
      points: clampInt(s.points ?? d.points, 0, 10_000),
      ...(d.threshold !== undefined
        ? { threshold: clampInt(s.threshold ?? d.threshold, 1, 9_999) }
        : {}),
    };
  }
  return out;
}

function clampInt(v: unknown, min: number, max: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}
