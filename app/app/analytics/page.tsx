"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/hooks/useAuthedFetch";
import { CenteredMessage } from "@/components/admin/AdminUI";
interface Analytics {
  achievements: { achievementKey: string; name: string; count: number }[];
  playerCounts: { playerCount: number; games: number }[];
  expansion: { withExpansion: number; total: number };
  products: {
    totalClicks: number;
    clicksLast30Days: number;
    topProducts: { productTitle: string; clicks: number }[];
    attributedOrders: number;
    revenueByCurrency: { currency: string; revenue: number; orders: number }[];
  };
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
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
    authedFetch("/api/admin/analytics").then(async (r) => {
      if (r.status === 401) { setAuthError(true); return; }
      const d = await r.json().catch(() => null);
      if (d?.analytics) { setData(d.analytics); return; }
      throw new Error(d?.error ?? `Server returned ${r.status}`);
    }).catch((e) => setLoadError(String(e?.message ?? e)));
  }, []);

  if (authError) return <CenteredMessage>This app must be opened from your Shopify admin.</CenteredMessage>;
  if (loadError) return <CenteredMessage>Couldn&rsquo;t load: {loadError}</CenteredMessage>;
  if (!data) return <CenteredMessage>Loading…</CenteredMessage>;

  const maxAchievement = Math.max(1, ...data.achievements.map((m) => m.count));
  const maxPlayers = Math.max(1, ...data.playerCounts.map((p) => p.games));
  const expansionRate = data.expansion.total
    ? Math.round((data.expansion.withExpansion / data.expansion.total) * 100)
    : 0;

  return (
    <main className="dml-main">
      <div className="dml-grid">
        <section className="dml-card dml-card-wide">
          <h2 className="dml-card-title">Achievements earned</h2>
          <p className="dml-card-hint">
            How often each achievement has actually been unlocked.
          </p>
          {data.achievements.length === 0 ? (
            <p className="dml-empty">No achievements earned yet.</p>
          ) : (
            data.achievements.map((m) => (
              <Bar key={m.achievementKey} label={m.name} value={m.count} max={maxAchievement} />
            ))
          )}
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

        <section className="dml-card">
          <h2 className="dml-card-title">Recommended products</h2>
          <p className="dml-card-hint">
            Taps on the winner-screen &ldquo;add to cart&rdquo; buttons, and orders those taps actually turned into.
          </p>
          <div className="dml-stats">
            <div className="dml-stat">
              <div className="dml-stat-value">{data.products.totalClicks}</div>
              <div className="dml-stat-label">Added to cart ({data.products.clicksLast30Days} last 30 days)</div>
            </div>
            <div className="dml-stat">
              <div className="dml-stat-value">{data.products.attributedOrders}</div>
              <div className="dml-stat-label">Orders containing a widget item</div>
            </div>
          </div>
          {data.products.revenueByCurrency.length > 0 && (
            <p className="dml-card-hint" style={{ marginTop: 8 }}>
              Revenue attributed:{" "}
              {data.products.revenueByCurrency
                .map((r) => formatMoney(r.revenue, r.currency))
                .join(" + ")}
            </p>
          )}
          <p className="dml-card-hint" style={{ marginTop: 4, fontSize: 12 }}>
            Revenue counts only the widget-added line items in an order, not the whole cart, and only once an order
            is paid.
          </p>
        </section>

        <section className="dml-card dml-card-wide">
          <h2 className="dml-card-title">Top products added to cart</h2>
          {data.products.topProducts.length === 0 ? (
            <p className="dml-empty">No add-to-cart taps yet.</p>
          ) : (
            data.products.topProducts.map((p) => (
              <Bar
                key={p.productTitle}
                label={p.productTitle}
                value={p.clicks}
                max={Math.max(1, ...data.products.topProducts.map((t) => t.clicks))}
              />
            ))
          )}
        </section>
      </div>
    </main>
  );
}
