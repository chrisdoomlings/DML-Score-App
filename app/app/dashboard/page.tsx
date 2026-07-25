"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/hooks/useAuthedFetch";
import { Stat, CenteredMessage } from "@/components/admin/AdminUI";

interface Summary {
  shop: string;
  totalGames: number;
  gamesLast30Days: number;
  gamesWithCustomer: number;
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [authError, setAuthError] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    authedFetch("/api/admin/summary").then((r) => {
      if (r.status === 401) { setAuthError(true); return; }
      return r.json();
    }).then((d) => d && setSummary(d.shop ? d : null))
      .catch((e) => setLoadError(String(e?.message ?? e)));
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
          </div>
        </section>

        <section className="dml-card">
          <h2 className="dml-card-title">Milestones &amp; points</h2>
          <p className="dml-card-hint">
            Configure how many points a game is worth, which milestone bonuses are active, and
            the &ldquo;Guess Who Won?&rdquo; mini-game.
          </p>
          <a className="dml-btn-secondary dml-btn-sm" href="/app/settings" style={{ display: "inline-block", textDecoration: "none" }}>
            Open Settings
          </a>
        </section>

        <section className="dml-card">
          <h2 className="dml-card-title">Deeper insights</h2>
          <p className="dml-card-hint">
            See which milestones are actually being earned, how the guess mini-game is performing,
            and how many players use expansion content.
          </p>
          <a className="dml-btn-secondary dml-btn-sm" href="/app/analytics" style={{ display: "inline-block", textDecoration: "none" }}>
            Open Analytics
          </a>
        </section>
      </div>
    </main>
  );
}
