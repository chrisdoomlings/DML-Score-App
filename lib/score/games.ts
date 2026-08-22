import { getDb, jsonb } from "@/lib/supabase/client";
import { getSettings } from "@/lib/score/settings";
import {
  evaluateAchievements,
  ACHIEVEMENT_KEYS,
  type AchievementKey,
  type AchievementConfig,
} from "@/lib/score/achievements";

export interface GamePlayer {
  name: string;
  we: number; // World's End points (may be negative)
  fv: number; // Face Value points
  bp: number; // Bonus points
  mp: number; // Expansion (Meaning of Life etc.) points
  total: number;
  isCustomer: boolean;
}

export interface SavedGame {
  id: string;
  playedAt: string;
  playerCount: number;
  winnerNames: string[];
  topScore: number;
  customerWon: boolean;
  players: GamePlayer[];
}

export interface AchievementUnlock {
  key: AchievementKey;
  name: string;
  description: string;
  iconUrl: string | null;
}

export interface AchievementStatus extends AchievementUnlock {
  unlocked: boolean;
  unlockedAt: string | null;
  gameId: string | null;
}

const MAX_PLAYERS = 12;
const POINT_MIN = -999;
const POINT_MAX = 9999;

/** Validates and normalizes the raw player payload from the storefront. */
export function sanitizePlayers(raw: unknown): GamePlayer[] | null {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > MAX_PLAYERS) return null;
  const players: GamePlayer[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return null;
    const o = item as Record<string, unknown>;
    const name = String(o.name ?? "").trim().slice(0, 30);
    if (!name) return null;
    const we = clamp(o.we);
    const fv = clamp(o.fv);
    const bp = clamp(o.bp);
    const mp = clamp(o.mp);
    players.push({
      name,
      we,
      fv,
      bp,
      mp,
      total: we + fv + bp + mp,
      isCustomer: o.isCustomer === true,
    });
  }
  // Only one seat can belong to the logged-in customer.
  if (players.filter((p) => p.isCustomer).length > 1) return null;
  return players;
}

function clamp(v: unknown): number {
  const n = Math.round(Number(v ?? 0));
  if (!Number.isFinite(n)) return 0;
  return Math.min(POINT_MAX, Math.max(POINT_MIN, n));
}

export async function saveGame(
  shop: string,
  customerId: string | null,
  players: GamePlayer[],
  deviceType: "mobile" | "desktop" | null,
  playedAtLocalDate: string | null,
  geo: { lat: number; lng: number } | null = null
): Promise<{ game: SavedGame; achievementsUnlocked: AchievementUnlock[]; guessOffered: boolean }> {
  const db = getDb();
  const topScore = Math.max(...players.map((p) => p.total));
  const winnerNames = players.filter((p) => p.total === topScore).map((p) => p.name);
  const customerWon = players.some((p) => p.isCustomer && p.total === topScore);

  let guessOffered = false;
  let gamesLoggedBefore = 0;
  let achievementsConfig: AchievementConfig | null = null;

  if (customerId) {
    const [settings, prior] = await Promise.all([
      getSettings(shop),
      db<{ n: number }[]>`
        SELECT COUNT(*)::int AS n FROM score_games
        WHERE shop = ${shop} AND customer_id = ${customerId}
      `,
    ]);
    gamesLoggedBefore = prior[0]?.n ?? 0;
    achievementsConfig = settings.achievements;

    // "Close game" = gap between 1st and runner-up within the configured max —
    // but not an all-way tie (guessing would be trivially correct).
    const runnerUp = players
      .map((p) => p.total)
      .filter((t) => t < topScore)
      .reduce((a, b) => Math.max(a, b), -Infinity);
    const closeGame = winnerNames.length < players.length && topScore - runnerUp <= settings.guessGapMax;
    guessOffered =
      settings.guessEnabled && closeGame && (gamesLoggedBefore + 1) % settings.guessEveryN === 0;
  }

  const rows = await db<{ id: string; playedAt: string }[]>`
    INSERT INTO score_games (
      shop, customer_id, player_count, winner_names, top_score, customer_won, players,
      guess_offered, device_type, played_at_local_date
    )
    VALUES (
      ${shop}, ${customerId}, ${players.length}, ${jsonb(winnerNames)}, ${topScore}, ${customerWon}, ${jsonb(players)},
      ${guessOffered}, ${deviceType}, ${playedAtLocalDate}
    )
    RETURNING id, played_at AS "playedAt"
  `;
  const game: SavedGame = {
    id: rows[0].id,
    playedAt: rows[0].playedAt,
    playerCount: players.length,
    winnerNames,
    topScore,
    customerWon,
    players,
  };

  const achievementsUnlocked: AchievementUnlock[] = [];
  if (customerId && achievementsConfig) {
    const candidateKeys = await evaluateAchievements(
      db,
      { shop, customerId, players, gamesLoggedBefore, deviceType, playedLocalDate: playedAtLocalDate, geo },
      achievementsConfig
    );

    for (const key of candidateKeys) {
      // Unique constraint makes replays and double-submits no-ops; this is
      // also what actually enforces "first time only" semantics.
      const inserted = await db<{ id: string }[]>`
        INSERT INTO score_achievements_unlocked (shop, customer_id, achievement_key, game_id)
        VALUES (${shop}, ${customerId}, ${key}, ${game.id})
        ON CONFLICT (shop, customer_id, achievement_key) DO NOTHING
        RETURNING id
      `;
      if (inserted.length) {
        const def = achievementsConfig[key];
        achievementsUnlocked.push({ key, name: def.name, description: def.description, iconUrl: def.iconUrl });
      }
    }
  }

  return { game, achievementsUnlocked, guessOffered };
}

/** Merges settings config with this customer's unlock rows — enabled achievements only. */
export async function getCustomerAchievements(shop: string, customerId: string): Promise<AchievementStatus[]> {
  const db = getDb();
  const [settings, rows] = await Promise.all([
    getSettings(shop),
    db<{ achievementKey: string; unlockedAt: string; gameId: string | null }[]>`
      SELECT achievement_key AS "achievementKey", unlocked_at AS "unlockedAt", game_id AS "gameId"
      FROM score_achievements_unlocked
      WHERE shop = ${shop} AND customer_id = ${customerId}
    `,
  ]);
  const unlockedMap = new Map(rows.map((r) => [r.achievementKey, r]));

  // Disabled achievements are hidden from the "still to earn" list, but one this
  // customer already unlocked must keep showing — disabling it later shouldn't
  // look like their earned badge got revoked.
  return ACHIEVEMENT_KEYS.filter((key) => settings.achievements[key].enabled || unlockedMap.has(key)).map((key) => {
    const def = settings.achievements[key];
    const u = unlockedMap.get(key);
    return {
      key,
      name: def.name,
      description: def.description,
      iconUrl: def.iconUrl,
      unlocked: Boolean(u),
      unlockedAt: u?.unlockedAt ?? null,
      gameId: u?.gameId ?? null,
    };
  });
}

/** Recent games for a customer, newest first — full embedded players[] per row. */
export async function getCustomerHistory(shop: string, customerId: string, limit = 50): Promise<SavedGame[]> {
  const db = getDb();
  const rows = await db<
    {
      id: string;
      playedAt: string;
      playerCount: number;
      winnerNames: string[];
      topScore: number;
      customerWon: boolean;
      players: GamePlayer[];
    }[]
  >`
    SELECT id, played_at AS "playedAt", player_count AS "playerCount",
           winner_names AS "winnerNames", top_score AS "topScore",
           customer_won AS "customerWon", players
    FROM score_games
    WHERE shop = ${shop} AND customer_id = ${customerId}
    ORDER BY played_at DESC LIMIT ${limit}
  `;
  return rows.map((g) => ({ ...g }));
}

export async function getShopSummary(shop: string) {
  const db = getDb();
  const [games, achievementsRow, dailyRows, recentGames] = await Promise.all([
    db<{ total: number; last30: number; identified: number }[]>`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE played_at > NOW() - INTERVAL '30 days')::int AS last30,
        COUNT(*) FILTER (WHERE customer_id IS NOT NULL)::int AS identified
      FROM score_games WHERE shop = ${shop}
    `,
    db<{ total: number }[]>`
      SELECT COUNT(*)::int AS total FROM score_achievements_unlocked WHERE shop = ${shop}
    `,
    db<{ day: unknown; count: number }[]>`
      SELECT played_at::date AS day, COUNT(*)::int AS count
      FROM score_games WHERE shop = ${shop} AND played_at > NOW() - INTERVAL '7 days'
      GROUP BY day
    `,
    db<{ playedAt: string; winnerNames: string[]; topScore: number; playerCount: number }[]>`
      SELECT played_at AS "playedAt", winner_names AS "winnerNames",
             top_score AS "topScore", player_count AS "playerCount"
      FROM score_games WHERE shop = ${shop} ORDER BY played_at DESC LIMIT 6
    `,
  ]);

  const dayKey = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
  const dailyMap = new Map(dailyRows.map((r) => [dayKey(r.day), r.count]));
  const last7Days: { date: string; games: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    last7Days.push({ date: key, games: dailyMap.get(key) ?? 0 });
  }

  return {
    totalGames: games[0]?.total ?? 0,
    gamesLast30Days: games[0]?.last30 ?? 0,
    gamesWithCustomer: games[0]?.identified ?? 0,
    totalAchievementsUnlocked: achievementsRow[0]?.total ?? 0,
    last7Days,
    recentGames,
  };
}

export interface ShopAnalytics {
  achievements: { achievementKey: string; name: string; count: number }[];
  guess: { offered: number; played: number; correct: number };
  playerCounts: { playerCount: number; games: number }[];
  expansion: { withExpansion: number; total: number };
}

export async function getShopAnalytics(shop: string): Promise<ShopAnalytics> {
  const db = getDb();
  const [settings, achievementCounts, guess, playerCounts, expansion] = await Promise.all([
    getSettings(shop),
    db<{ achievementKey: string; count: number }[]>`
      SELECT achievement_key AS "achievementKey", COUNT(*)::int AS count
      FROM score_achievements_unlocked
      WHERE shop = ${shop}
      GROUP BY achievement_key ORDER BY count DESC
    `,
    db<{ offered: number; played: number; correct: number }[]>`
      SELECT
        COUNT(*) FILTER (WHERE guess_offered)::int      AS offered,
        COUNT(*) FILTER (WHERE guess_name IS NOT NULL)::int AS played,
        COUNT(*) FILTER (WHERE guess_correct)::int       AS correct
      FROM score_games WHERE shop = ${shop}
    `,
    db<{ playerCount: number; games: number }[]>`
      SELECT player_count AS "playerCount", COUNT(*)::int AS games
      FROM score_games WHERE shop = ${shop}
      GROUP BY player_count ORDER BY player_count
    `,
    db<{ withExpansion: number; total: number }[]>`
      SELECT
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM jsonb_array_elements(players) elem WHERE (elem->>'mp')::int > 0
        ))::int AS "withExpansion",
        COUNT(*)::int AS total
      FROM score_games WHERE shop = ${shop}
    `,
  ]);

  return {
    achievements: achievementCounts.map((a) => ({
      ...a,
      name: settings.achievements[a.achievementKey as AchievementKey]?.name ?? a.achievementKey,
    })),
    guess: guess[0] ?? { offered: 0, played: 0, correct: 0 },
    playerCounts,
    expansion: expansion[0] ?? { withExpansion: 0, total: 0 },
  };
}
