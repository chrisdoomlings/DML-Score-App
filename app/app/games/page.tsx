"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/hooks/useAuthedFetch";
import { CenteredMessage } from "@/components/admin/AdminUI";

interface Game {
  id: string;
  playedAt: string;
  playerCount: number;
  winnerNames: string[];
  topScore: number;
  players: { name: string; total: number }[];
}

interface GamesResponse {
  games: Game[];
  total: number;
  page: number;
  pageSize: number;
}

export default function GamesPage() {
  const [data, setData] = useState<GamesResponse | null>(null);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [authError, setAuthError] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [resetCustomerId, setResetCustomerId] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);

  function resetCustomer() {
    const id = resetCustomerId.trim();
    if (!id) return;
    setResetting(true);
    setResetMsg(null);
    authedFetch("/api/admin/customer-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: id }),
    })
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        if (r.ok && d?.ok) {
          setResetMsg({
            ok: true,
            text: `Deleted ${d.gamesDeleted} game${d.gamesDeleted === 1 ? "" : "s"}, ${d.achievementsDeleted} achievement${d.achievementsDeleted === 1 ? "" : "s"}, and ${d.profileDeleted ? "the saved profile" : "no profile"}.`,
          });
          setResetCustomerId("");
          setPage(0);
          // Re-fetch page 0 so a reset customer's games disappear from the list immediately.
          authedFetch("/api/admin/games?page=0").then(async (r2) => {
            const d2 = await r2.json().catch(() => null);
            if (d2?.games) setData(d2);
          });
        } else {
          setResetMsg({ ok: false, text: d?.error ?? `Server returned ${r.status}` });
        }
      })
      .catch((e) => setResetMsg({ ok: false, text: String(e?.message ?? e) }))
      .finally(() => {
        setResetting(false);
        setConfirmingReset(false);
      });
  }

  useEffect(() => {
    setLoadError("");
    authedFetch(`/api/admin/games?page=${page}`).then(async (r) => {
      if (r.status === 401) { setAuthError(true); return; }
      const d = await r.json().catch(() => null);
      if (d?.games) { setData(d); return; }
      throw new Error(d?.error ?? `Server returned ${r.status}`);
    }).catch((e) => setLoadError(String(e?.message ?? e)));
  }, [page]);

  if (authError) return <CenteredMessage>This app must be opened from your Shopify admin.</CenteredMessage>;
  if (loadError) return <CenteredMessage>Couldn&rsquo;t load: {loadError}</CenteredMessage>;
  if (!data) return <CenteredMessage>Loading…</CenteredMessage>;

  const lastPage = Math.max(0, Math.ceil(data.total / data.pageSize) - 1);

  return (
    <main className="dml-main">
      <div className="dml-grid">
        <section className="dml-card dml-card-wide">
          <h2 className="dml-card-title">All games</h2>
          <p className="dml-card-hint">
            {data.total} game{data.total === 1 ? "" : "s"} logged through the tool, newest first.
          </p>
          {data.games.length === 0 ? (
            <p className="dml-empty">No games logged yet.</p>
          ) : (
            <ul className="dml-recent-list dml-recent-list-2col">
              {data.games.map((g) => {
                const d = new Date(g.playedAt);
                const when = `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}.${d.getFullYear()}`;
                const players = g.players || [];
                const isOpen = !!expanded[g.id];
                return (
                  <li key={g.id} className="dml-recent-row">
                    <p className="dml-recent-title">{g.winnerNames.join(" & ")} won with {g.topScore} pts.</p>
                    <div className="dml-recent-meta-row">
                      <span className="dml-recent-date">{when}</span>
                      <span>{g.playerCount} players</span>
                      {players.length > 1 && (
                        <button
                          type="button" className="dml-recent-more"
                          onClick={() => setExpanded((e) => ({ ...e, [g.id]: !e[g.id] }))}
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
          )}
          {lastPage > 0 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 20 }}>
              <button
                type="button" className="dml-btn-ghost dml-btn-sm" disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                ← Newer
              </button>
              <span style={{ fontSize: 13, color: "#6d7175" }}>Page {page + 1} of {lastPage + 1}</span>
              <button
                type="button" className="dml-btn-ghost dml-btn-sm" disabled={page >= lastPage}
                onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
              >
                Older →
              </button>
            </div>
          )}
        </section>

        <section className="dml-card dml-card-wide">
          <h2 className="dml-card-title">Reset customer data</h2>
          <p className="dml-card-hint">
            Permanently deletes a customer&rsquo;s logged games, unlocked achievements, and saved birthday for this
            shop &mdash; e.g. to clear a support or test account so achievements can be earned again. This does not
            affect guest games (no customer account attached). Irreversible.
          </p>
          {resetMsg && <p className={resetMsg.ok ? "dml-msg-ok" : "dml-msg-err"} style={{ marginBottom: 12 }}>{resetMsg.text}</p>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              className="dml-input dml-input-sm" style={{ maxWidth: 260 }}
              placeholder="Customer ID (e.g. 6171257372881)"
              value={resetCustomerId}
              onChange={(e) => { setResetCustomerId(e.target.value); setConfirmingReset(false); setResetMsg(null); }}
              disabled={resetting}
            />
            {!confirmingReset ? (
              <button
                type="button" className="dml-btn-secondary dml-btn-sm"
                disabled={!resetCustomerId.trim() || resetting}
                onClick={() => setConfirmingReset(true)}
              >
                Reset&hellip;
              </button>
            ) : (
              <>
                <span style={{ fontSize: 13, color: "#d72c0d", fontWeight: 600 }}>Delete everything for this customer?</span>
                <button type="button" className="dml-btn-primary dml-btn-sm" style={{ background: "#d72c0d" }} disabled={resetting} onClick={resetCustomer}>
                  {resetting ? "Deleting…" : "Yes, delete"}
                </button>
                <button type="button" className="dml-btn-ghost dml-btn-sm" disabled={resetting} onClick={() => setConfirmingReset(false)}>
                  Cancel
                </button>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
