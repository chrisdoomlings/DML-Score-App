import type { GamePlayer } from "@/lib/score/games";
import { getDb } from "@/lib/supabase/client";
import { sanitizeImageUrl } from "@/lib/score/imageUrl";

/**
 * Achievement rules — server-evaluated from validated game data only.
 * Replaces the old points/milestones system entirely (lib/score/milestones.ts,
 * now deleted): 20 fixed, stable keys. Unlike milestones, thresholds/point
 * values here are NOT admin-configurable — only enabled/name/description/
 * iconUrl are (score_settings.achievements JSONB merged over
 * DEFAULT_ACHIEVEMENTS). Names/icons are placeholders revealed only once
 * unlocked; `description` here is the internal trigger-condition text shown
 * in the admin UI, not player-facing copy.
 *
 * Idempotency ("only once ever") is NOT this module's job — it just reports
 * which keys are eligible for *this* game. The caller (saveGame) attempts an
 * insert per key with `ON CONFLICT (shop, customer_id, achievement_key) DO
 * NOTHING`, and the DB's unique constraint is what actually enforces
 * "first time only" for keys like first_game_ever/first_tie.
 */

export type AchievementKey =
  | "first_game_ever"
  | "first_game_mobile"
  | "first_game_desktop"
  | "score_50_plus"
  | "score_100_plus"
  | "players_2"
  | "players_3"
  | "players_4"
  | "players_5"
  | "players_6"
  | "players_7_plus"
  | "first_tie"
  | "blowout_gap_30"
  | "close_one_gap_5"
  | "streak_7_day"
  | "new_year"
  | "christmas"
  | "valentines"
  | "halloween"
  | "birthday";

export const ACHIEVEMENT_KEYS: AchievementKey[] = [
  "first_game_ever",
  "first_game_mobile",
  "first_game_desktop",
  "score_50_plus",
  "score_100_plus",
  "players_2",
  "players_3",
  "players_4",
  "players_5",
  "players_6",
  "players_7_plus",
  "first_tie",
  "blowout_gap_30",
  "close_one_gap_5",
  "streak_7_day",
  "new_year",
  "christmas",
  "valentines",
  "halloween",
  "birthday",
];

export interface AchievementDef {
  enabled: boolean;
  name: string;
  description: string;
  iconUrl: string | null;
}

export type AchievementConfig = Record<AchievementKey, AchievementDef>;

export const DEFAULT_ACHIEVEMENTS: AchievementConfig = {
  first_game_ever: {
    enabled: true,
    name: "Babies First Doomlings",
    description: "First game logged ever (any device).",
    iconUrl: null,
  },
  first_game_mobile: {
    enabled: true,
    name: "You Have Games on Your Phone?",
    description: "First game logged on a mobile device.",
    iconUrl: null,
  },
  first_game_desktop: {
    enabled: true,
    name: "Hackerman",
    description: "First game logged on desktop/tablet.",
    iconUrl: null,
  },
  score_50_plus: {
    enabled: true,
    name: "Need new name",
    description: "Any player scores more than 50 points in a game.",
    iconUrl: null,
  },
  score_100_plus: {
    enabled: true,
    name: "High Roller",
    description: "Any player scores more than 100 points in a game.",
    iconUrl: null,
  },
  players_2: {
    enabled: true,
    name: "Twinning",
    description: "Game has exactly 2 players.",
    iconUrl: null,
  },
  players_3: {
    enabled: true,
    name: "Three's a Charm",
    description: "Game has exactly 3 players.",
    iconUrl: null,
  },
  players_4: {
    enabled: true,
    name: "Quartet",
    description: "Game has exactly 4 players.",
    iconUrl: null,
  },
  players_5: {
    enabled: true,
    name: "Five's A Party",
    description: "Game has exactly 5 players.",
    iconUrl: null,
  },
  players_6: {
    enabled: true,
    name: "Wow So Popular",
    description: "Game has exactly 6 players.",
    iconUrl: null,
  },
  players_7_plus: {
    enabled: true,
    name: "Game Breaker",
    description: "Game has more than 6 players.",
    iconUrl: null,
  },
  first_tie: {
    enabled: true,
    name: "Besties",
    description: "First game where 2+ players share the top score.",
    iconUrl: null,
  },
  blowout_gap_30: {
    enabled: true,
    name: "F in Chat",
    description: "Gap between the winner's score and the lowest scorer is more than 30 points.",
    iconUrl: null,
  },
  close_one_gap_5: {
    enabled: true,
    name: "Close One",
    description: "Every player's score is within 5 points of each other.",
    iconUrl: null,
  },
  streak_7_day: {
    enabled: true,
    name: "Biggest Fan",
    description: "Played once a day, 7 days straight (consecutive local calendar dates).",
    iconUrl: null,
  },
  new_year: {
    enabled: true,
    name: "Happy Doom Year!",
    description: "Played on Dec 31 or Jan 1 (local date).",
    iconUrl: null,
  },
  christmas: {
    enabled: true,
    name: "Ho ho ho",
    description: "Played on Dec 25 (local date).",
    iconUrl: null,
  },
  valentines: {
    enabled: true,
    name: "Date Night",
    description: "Played on Feb 14 (local date).",
    iconUrl: null,
  },
  halloween: {
    enabled: true,
    name: "Trick or Treat",
    description: "Played on Oct 31 (local date).",
    iconUrl: null,
  },
  birthday: {
    enabled: true,
    name: "Birthdoom",
    description: "Played on the customer's self-reported birthday.",
    iconUrl: null,
  },
};

/** Merge stored JSONB (possibly partial/stale keys) over the defaults. */
export function mergeAchievementConfig(stored: unknown): AchievementConfig {
  const out = {} as AchievementConfig;
  const src = (typeof stored === "object" && stored !== null ? stored : {}) as Record<
    string,
    Partial<AchievementDef>
  >;
  for (const key of ACHIEVEMENT_KEYS) {
    const d = DEFAULT_ACHIEVEMENTS[key];
    const s = src[key] ?? {};
    out[key] = {
      enabled: typeof s.enabled === "boolean" ? s.enabled : d.enabled,
      name: sanitizeText(s.name, 60) ?? d.name,
      description: sanitizeText(s.description, 200) ?? d.description,
      iconUrl: typeof s.iconUrl === "string" ? sanitizeImageUrl(s.iconUrl) || null : d.iconUrl,
    };
  }
  return out;
}

function sanitizeText(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim().slice(0, max);
  return trimmed || undefined;
}

/** MM-DD, independent of year — used for the seasonal + birthday checks. */
function monthDay(dateStr: string): string {
  return dateStr.slice(5, 10);
}

/**
 * Pure/sync: everything derivable from a single game's data (keys #1-14 and
 * #16-19). Only returns keys that are both enabled in `config` and whose
 * condition is true for this game — the "first ever" semantics for
 * first_game_ever/first_game_mobile/first_game_desktop/first_tie come from
 * the caller's idempotent insert (ON CONFLICT DO NOTHING), not from querying
 * unlock history here.
 */
export function evaluateSingleGameAchievements(
  players: GamePlayer[],
  gamesLoggedBefore: number,
  deviceType: "mobile" | "desktop" | null,
  playedLocalDate: string | null,
  config: AchievementConfig
): AchievementKey[] {
  const hits: AchievementKey[] = [];
  const hit = (key: AchievementKey, ok: boolean) => {
    if (config[key]?.enabled && ok) hits.push(key);
  };

  const totals = players.map((p) => p.total);
  const topScore = Math.max(...totals);
  const lowScore = Math.min(...totals);
  const winners = players.filter((p) => p.total === topScore);
  const isFirstGame = gamesLoggedBefore === 0;

  hit("first_game_ever", isFirstGame);
  hit("first_game_mobile", isFirstGame && deviceType === "mobile");
  hit("first_game_desktop", isFirstGame && deviceType === "desktop");

  hit("score_50_plus", totals.some((t) => t > 50));
  hit("score_100_plus", totals.some((t) => t > 100));

  hit("players_2", players.length === 2);
  hit("players_3", players.length === 3);
  hit("players_4", players.length === 4);
  hit("players_5", players.length === 5);
  hit("players_6", players.length === 6);
  hit("players_7_plus", players.length > 6);

  hit("first_tie", winners.length > 1);
  hit("blowout_gap_30", topScore - lowScore > 30);
  hit("close_one_gap_5", topScore - lowScore <= 5);

  if (playedLocalDate) {
    const md = monthDay(playedLocalDate);
    hit("new_year", md === "12-31" || md === "01-01");
    hit("christmas", md === "12-25");
    hit("valentines", md === "02-14");
    hit("halloween", md === "10-31");
  }

  return hits;
}

type Db = ReturnType<typeof getDb>;

/**
 * Async: checks 7 consecutive distinct `played_at_local_date` values in the
 * shop+customer's game history, trailing week ending on `playedLocalDate`
 * inclusive. Assumes the current game's row (with its played_at_local_date)
 * is already inserted — saveGame() evaluates achievements after the insert.
 */
export async function evaluateStreak(
  sql: Db,
  shop: string,
  customerId: string,
  playedLocalDate: string
): Promise<boolean> {
  const rows = await sql<{ d: string }[]>`
    SELECT DISTINCT played_at_local_date AS d
    FROM score_games
    WHERE shop = ${shop}
      AND customer_id = ${customerId}
      AND played_at_local_date IS NOT NULL
      AND played_at_local_date <= ${playedLocalDate}::date
      AND played_at_local_date > ${playedLocalDate}::date - INTERVAL '6 days'
  `;
  const dayKey = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
  const present = new Set(rows.map((r) => dayKey(r.d)));
  const base = new Date(`${playedLocalDate}T00:00:00Z`);
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - i);
    if (!present.has(d.toISOString().slice(0, 10))) return false;
  }
  return true;
}

async function fetchBirthday(sql: Db, shop: string, customerId: string): Promise<string | null> {
  const rows = await sql<{ birthday: string | null }[]>`
    SELECT birthday FROM score_customer_profile WHERE shop = ${shop} AND customer_id = ${customerId}
  `;
  return rows[0]?.birthday ?? null;
}

/** Exported for reuse by the achievements proxy route (`profile.hasBirthday`). */
export async function getCustomerBirthday(sql: Db, shop: string, customerId: string): Promise<string | null> {
  return fetchBirthday(sql, shop, customerId);
}

/** Async: MM-DD match against the customer's self-reported birthday. */
export async function evaluateBirthday(
  sql: Db,
  shop: string,
  customerId: string,
  playedLocalDate: string
): Promise<boolean> {
  const birthday = await fetchBirthday(sql, shop, customerId);
  if (!birthday) return false;
  return monthDay(birthday) === monthDay(playedLocalDate);
}

export interface EvaluateAchievementsParams {
  shop: string;
  customerId: string;
  players: GamePlayer[];
  gamesLoggedBefore: number;
  deviceType: "mobile" | "desktop" | null;
  playedLocalDate: string | null;
}

/**
 * Orchestrates single-game + streak + birthday checks. Returns candidate keys
 * (config-enabled AND condition-true) for saveGame() to attempt-insert; NOT
 * pre-filtered by "already unlocked" — the caller's ON CONFLICT DO NOTHING
 * handles that.
 */
export async function evaluateAchievements(
  sql: Db,
  params: EvaluateAchievementsParams,
  config: AchievementConfig
): Promise<AchievementKey[]> {
  const { shop, customerId, players, gamesLoggedBefore, deviceType, playedLocalDate } = params;

  const hits = new Set<AchievementKey>(
    evaluateSingleGameAchievements(players, gamesLoggedBefore, deviceType, playedLocalDate, config)
  );

  if (playedLocalDate) {
    if (config.streak_7_day?.enabled && (await evaluateStreak(sql, shop, customerId, playedLocalDate))) {
      hits.add("streak_7_day");
    }
    if (config.birthday?.enabled && (await evaluateBirthday(sql, shop, customerId, playedLocalDate))) {
      hits.add("birthday");
    }
  }

  return [...hits];
}
