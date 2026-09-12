"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/hooks/useAuthedFetch";
import { Stat, CenteredMessage } from "@/components/admin/AdminUI";

interface Summary {
  shop: string;
  totalGames: number;
  gamesLast30Days: number;
  gamesWithCustomer: number;
  totalAchievementsUnlocked: number;
  last7Days: { date: string; games: number }[];
  recentGames: {
    playedAt: string;
    winnerNames: string[];
    topScore: number;
    playerCount: number;
    players: { name: string; total: number }[];
  }[];
}

function TrendChart({ data }: { data: { date: string; games: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.games));
  return (
    <div className="dml-trend">
      {data.map((d) => {
        const h = d.games === 0 ? 3 : Math.max(6, Math.round((d.games / max) * 64));
        const day = new Date(`${d.date}T00:00:00Z`);
        const weekday = day.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" });
        const full = day.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
        return (
          <div className="dml-trend-col" key={d.date} title={`${d.games} game${d.games === 1 ? "" : "s"} on ${full}`}>
            <span className="dml-trend-count">{d.games}</span>
            <div className="dml-trend-bararea"><div className="dml-trend-bar" style={{ height: h }} /></div>
            <span className="dml-trend-day">{weekday}</span>
          </div>
        );
      })}
    </div>
  );
}

function RecentGames({ games }: { games: Summary["recentGames"] }) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  if (games.length === 0) return <p className="dml-empty">No games logged yet.</p>;
  return (
    <ul className="dml-recent-list">
      {games.map((g, i) => {
        const d = new Date(g.playedAt);
        const when = `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}.${d.getFullYear()}`;
        const players = g.players || [];
        const isOpen = !!expanded[i];
        return (
          <li key={i} className="dml-recent-row">
            <p className="dml-recent-title">{g.winnerNames.join(" & ")} won with {g.topScore} pts.</p>
            <div className="dml-recent-meta-row">
              <span className="dml-recent-date">{when}</span>
              <span>{g.playerCount} players</span>
              {players.length > 1 && (
                <button
                  type="button" className="dml-recent-more"
                  onClick={() => setExpanded((e) => ({ ...e, [i]: !e[i] }))}
                >
                  {isOpen ? "View less" : "View more"}
                </button>
              )}
            </div>
            {isOpen && players.length > 1 && (
              <div className="dml-recent-detail">
                {players.map((p, pi) => (
                  <div key={pi} className="dml-recent-detail-row">
                    <span>{p.name}</span>
                    <b>{p.total} pts</b>
                  </div>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [authError, setAuthError] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    authedFetch("/api/admin/summary").then(async (r) => {
      if (r.status === 401) { setAuthError(true); return; }
      const d = await r.json().catch(() => null);
      if (d?.shop) { setSummary(d); return; }
      throw new Error(d?.error ?? `Server returned ${r.status}`);
    }).catch((e) => setLoadError(String(e?.message ?? e)));
  }, []);

  if (authError) return <CenteredMessage>This app must be opened from your Shopify admin.</CenteredMessage>;
  if (loadError) return <CenteredMessage>Couldn&rsquo;t load: {loadError}</CenteredMessage>;
  if (!summary) return <CenteredMessage>Loading…</CenteredMessage>;

  const pct = summary.totalGames ? Math.round((summary.gamesWithCustomer / summary.totalGames) * 100) : 0;

  return (
    <main className="dml-main">
      <div className="dml-grid">
        <section className="dml-card dml-card-wide">
          <h2 className="dml-card-title">Activity</h2>
          <p className="dml-card-hint">All games logged through the score tool, across all players.</p>
          <div className="dml-stats">
            <Stat label="Games logged" value={summary.totalGames} />
            <Stat label="Last 30 days" value={summary.gamesLast30Days} />
            <Stat label="By logged-in customers" value={summary.gamesWithCustomer} />
            <Stat label="Signed-in rate" value={`${pct}%`} />
            <Stat label="Achievements unlocked" value={summary.totalAchievementsUnlocked} />
          </div>
        </section>

        <section className="dml-card dml-card-wide">
          <h2 className="dml-card-title">Last 7 days</h2>
          <p className="dml-card-hint">Games logged per day.</p>
          <TrendChart data={summary.last7Days} />
        </section>

        <section className="dml-card">
          <h2 className="dml-card-title">Recent games</h2>
          <p className="dml-card-hint">The latest games logged through the tool.</p>
          <RecentGames games={summary.recentGames} />
        </section>

        <section className="dml-card">
          <h2 className="dml-card-title">Achievements</h2>
          <p className="dml-card-hint">
            Configure which of the 20 achievements are active, and their names/descriptions/icons.
          </p>
          <a className="dml-btn-secondary dml-btn-sm" href="/app/settings" style={{ display: "inline-block", textDecoration: "none" }}>
            Open Settings
          </a>
        </section>

        <section className="dml-card">
          <h2 className="dml-card-title">Deeper insights</h2>
          <p className="dml-card-hint">
            See which achievements are actually being earned and how many players use expansion content.
          </p>
          <a className="dml-btn-secondary dml-btn-sm" href="/app/analytics" style={{ display: "inline-block", textDecoration: "none" }}>
            Open Analytics
          </a>
        </section>
      </div>
    </main>
  );
}
