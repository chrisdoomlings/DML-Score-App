"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/hooks/useAuthedFetch";
import { CenteredMessage } from "@/components/admin/AdminUI";
import { MILESTONE_LABELS, type MilestoneKey } from "@/lib/score/milestones";

interface Analytics {
  milestones: { reason: string; count: number; totalPoints: number }[];
  guess: { offered: number; played: number; correct: number };
  playerCounts: { playerCount: number; games: number }[];
  expansion: { withExpansion: number; total: number };
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="dml-bar-row">
      <span className="dml-bar-label">{label}</span>
      <div className="dml-bar-track"><div className="dml-bar-fill" style={{ width: `${pct}%` }} /></div>
      <span className="dml-bar-value">{value}</span>
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [authError, setAuthError] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    authedFetch("/api/admin/analytics").then((r) => {
      if (r.status === 401) { setAuthError(true); return; }
      return r.json();
    }).then((d) => d && setData(d.analytics ?? null))
      .catch((e) => setLoadError(String(e?.message ?? e)));
  }, []);

  if (authError) return <CenteredMessage>This app must be opened from your Shopify admin.</CenteredMessage>;
  if (loadError) return <CenteredMessage>Couldn&rsquo;t load: {loadError}</CenteredMessage>;
  if (!data) return <CenteredMessage>Loading…</CenteredMessage>;

  const maxMilestone = Math.max(1, ...data.milestones.map((m) => m.count));
  const maxPlayers = Math.max(1, ...data.playerCounts.map((p) => p.games));
  const guessPlayRate = data.guess.offered ? Math.round((data.guess.played / data.guess.offered) * 100) : 0;
  const guessCorrectRate = data.guess.played ? Math.round((data.guess.correct / data.guess.played) * 100) : 0;
  const expansionRate = data.expansion.total
    ? Math.round((data.expansion.withExpansion / data.expansion.total) * 100)
    : 0;

  return (
    <main className="dml-main">
      <div className="dml-grid">
        <section className="dml-card dml-card-wide">
          <h2 className="dml-card-title">Milestones earned</h2>
          <p className="dml-card-hint">
            How often each milestone has actually been awarded — useful for deciding the
            client&rsquo;s formal milestone list and point values.
          </p>
          {data.milestones.length === 0 ? (
            <p className="dml-empty">No milestones earned yet.</p>
          ) : (
            data.milestones.map((m) => {
              const key = m.reason.replace(/^milestone_/, "") as MilestoneKey;
              return (
                <Bar key={m.reason} label={MILESTONE_LABELS[key] ?? m.reason} value={m.count} max={maxMilestone} />
              );
            })
          )}
        </section>

        <section className="dml-card">
          <h2 className="dml-card-title">&ldquo;Guess Who Won?&rdquo;</h2>
          <p className="dml-card-hint">Engagement with the mini-game, out of games it was offered on.</p>
          <div className="dml-stats">
            <div className="dml-stat">
              <div className="dml-stat-value">{data.guess.offered}</div>
              <div className="dml-stat-label">Offered</div>
            </div>
            <div className="dml-stat">
              <div className="dml-stat-value">{guessPlayRate}%</div>
              <div className="dml-stat-label">Played ({data.guess.played})</div>
            </div>
            <div className="dml-stat">
              <div className="dml-stat-value">{guessCorrectRate}%</div>
              <div className="dml-stat-label">Correct ({data.guess.correct})</div>
            </div>
          </div>
        </section>

        <section className="dml-card">
          <h2 className="dml-card-title">Expansion adoption</h2>
          <p className="dml-card-hint">Games where at least one player used Meaning of Life points.</p>
          <div className="dml-stats">
            <div className="dml-stat">
              <div className="dml-stat-value">{expansionRate}%</div>
              <div className="dml-stat-label">{data.expansion.withExpansion} of {data.expansion.total} games</div>
            </div>
          </div>
        </section>

        <section className="dml-card dml-card-wide">
          <h2 className="dml-card-title">Players per game</h2>
          <p className="dml-card-hint">Validates whether the 5&ndash;6 player milestone threshold makes sense.</p>
          {data.playerCounts.length === 0 ? (
            <p className="dml-empty">No games logged yet.</p>
          ) : (
            data.playerCounts.map((p) => (
              <Bar key={p.playerCount} label={`${p.playerCount} players`} value={p.games} max={maxPlayers} />
            ))
          )}
        </section>
      </div>
    </main>
  );
}
