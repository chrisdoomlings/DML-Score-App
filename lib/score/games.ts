import { getDb, jsonb } from "@/lib/supabase/client";
import { getSettings } from "@/lib/score/settings";
import { evaluateMilestones, milestoneReason, type MilestoneAward } from "@/lib/score/milestones";

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

export interface CustomerStats {
  gamesLogged: number;
  wins: number;
  bestScore: number;
  points: number;
  recentGames: SavedGame[];
}

const MAX_PLAYERS = 8;
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
  players: GamePlayer[]
): Promise<{ game: SavedGame; pointsAwarded: number; milestones: MilestoneAward[]; guessOffered: boolean }> {
  const db = getDb();
  const topScore = Math.max(...players.map((p) => p.total));
  const winnerNames = players.filter((p) => p.total === topScore).map((p) => p.name);
  const customerWon = players.some((p) => p.isCustomer && p.total === topScore);

  let milestones: MilestoneAward[] = [];
  let guessOffered = false;
  let basePoints = 0;

  if (customerId) {
    const [settings, prior] = await Promise.all([
      getSettings(shop),
      db<{ n: number }[]>`
        SELECT COUNT(*)::int AS n FROM score_games
        WHERE shop = ${shop} AND customer_id = ${customerId}
      `,
    ]);
    const gamesLoggedBefore = prior[0]?.n ?? 0;
    basePoints = settings.pointsPerGame;
    milestones = evaluateMilestones(players, gamesLoggedBefore, settings.milestones);

    // "Close game" = gap between 1st and runner-up within the configured max —
    // but not an all-way tie (guessing would be trivially correct).
    const runnerUp = players
      .map((p) => p.total)
      .filter((t) => t < topScore)
      .reduce((a, b) => Math.max(a, b), -Infinity);
    const closeGame = winnerNames.length < players.length && topScore - runnerUp <= settings.guessGapMax;
    guessOffered =
      settings.guessEnabled &&
      settings.guessPoints > 0 &&
      closeGame &&
      (gamesLoggedBefore + 1) % settings.guessEveryN === 0;
  }

  const rows = await db<{ id: string; playedAt: string }[]>`
    INSERT INTO score_games (shop, customer_id, player_count, winner_names, top_score, customer_won, players, guess_offered)
    VALUES (${shop}, ${customerId}, ${players.length}, ${jsonb(winnerNames)}, ${topScore}, ${customerWon}, ${jsonb(players)}, ${guessOffered})
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

  let pointsAwarded = 0;
  if (customerId) {
    if (basePoints > 0) {
      const inserted = await db`
        INSERT INTO score_points_ledger (shop, customer_id, points, reason, game_id)
        VALUES (${shop}, ${customerId}, ${basePoints}, 'game_logged', ${game.id})
        ON CONFLICT DO NOTHING
        RETURNING id
      `;
      if (inserted.length) pointsAwarded += basePoints;
    }
    const kept: MilestoneAward[] = [];
    for (const m of milestones) {
      // Unique partial indexes make replays and double-submits no-ops.
      const inserted = await db`
        INSERT INTO score_points_ledger (shop, customer_id, points, reason, game_id)
        VALUES (${shop}, ${customerId}, ${m.points}, ${milestoneReason(m.key)}, ${game.id})
        ON CONFLICT DO NOTHING
        RETURNING id
      `;
      if (inserted.length) {
        kept.push(m);
        pointsAwarded += m.points;
      }
    }
    milestones = kept;
  }

  return { game, pointsAwarded, milestones, guessOffered };
}

export async function getCustomerStats(shop: string, customerId: string): Promise<CustomerStats> {
  const db = getDb();
  const [agg, points, recent] = await Promise.all([
    db<{ gamesLogged: number; wins: number; bestScore: number | null }[]>`
      SELECT
        COUNT(*)::int                              AS "gamesLogged",
        COUNT(*) FILTER (WHERE customer_won)::int  AS "wins",
        MAX(top_score)                             AS "bestScore"
      FROM score_games WHERE shop = ${shop} AND customer_id = ${customerId}
    `,
    db<{ total: number | null }[]>`
      SELECT SUM(points)::int AS total FROM score_points_ledger
      WHERE shop = ${shop} AND customer_id = ${customerId}
    `,
    db<{ id: string; playedAt: string; playerCount: number; winnerNames: string[]; topScore: number; customerWon: boolean; players: GamePlayer[] }[]>`
      SELECT id, played_at AS "playedAt", player_count AS "playerCount",
             winner_names AS "winnerNames", top_score AS "topScore",
             customer_won AS "customerWon", players
      FROM score_games
      WHERE shop = ${shop} AND customer_id = ${customerId}
      ORDER BY played_at DESC LIMIT 10
    `,
  ]);

  return {
    gamesLogged: agg[0]?.gamesLogged ?? 0,
    wins: agg[0]?.wins ?? 0,
    bestScore: agg[0]?.bestScore ?? 0,
    points: points[0]?.total ?? 0,
    recentGames: recent.map((g) => ({ ...g })),
  };
}

export async function getShopSummary(shop: string) {
  const db = getDb();
  const games = await db<{ total: number; last30: number; identified: number }[]>`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE played_at > NOW() - INTERVAL '30 days')::int AS last30,
      COUNT(*) FILTER (WHERE customer_id IS NOT NULL)::int AS identified
    FROM score_games WHERE shop = ${shop}
  `;
  return {
    totalGames: games[0]?.total ?? 0,
    gamesLast30Days: games[0]?.last30 ?? 0,
    gamesWithCustomer: games[0]?.identified ?? 0,
  };
}
