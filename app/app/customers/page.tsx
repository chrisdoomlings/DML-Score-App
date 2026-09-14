"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/hooks/useAuthedFetch";
import { CenteredMessage } from "@/components/admin/AdminUI";

interface CustomerRow {
  customerId: string;
  gamesPlayed: number;
  achievementsUnlocked: number;
  lastPlayedAt: string;
  displayName: string | null;
  email: string | null;
}

interface CustomersResponse {
  customers: CustomerRow[];
  total: number;
  page: number;
  pageSize: number;
}

export default function CustomersPage() {
  const [data, setData] = useState<CustomersResponse | null>(null);
  const [page, setPage] = useState(0);
  const [authError, setAuthError] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetMsg, setResetMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  function load() {
    setLoadError("");
    authedFetch(`/api/admin/customers?page=${page}`).then(async (r) => {
      if (r.status === 401) { setAuthError(true); return; }
      const d = await r.json().catch(() => null);
      if (d?.customers) { setData(d); return; }
      throw new Error(d?.error ?? `Server returned ${r.status}`);
    }).catch((e) => setLoadError(String(e?.message ?? e)));
  }

  useEffect(load, [page]);

  function resetCustomer(customerId: string) {
    setResettingId(customerId);
    setResetMsg(null);
    authedFetch("/api/admin/customer-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId }),
    })
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        if (r.ok && d?.ok) {
          setResetMsg({
            id: customerId, ok: true,
            text: `Deleted ${d.gamesDeleted} game${d.gamesDeleted === 1 ? "" : "s"} and ${d.achievementsDeleted} achievement${d.achievementsDeleted === 1 ? "" : "s"}.`,
          });
          load(); // row disappears once its games are gone
        } else {
          setResetMsg({ id: customerId, ok: false, text: d?.error ?? `Server returned ${r.status}` });
        }
      })
      .catch((e) => setResetMsg({ id: customerId, ok: false, text: String(e?.message ?? e) }))
      .finally(() => {
        setResettingId(null);
        setConfirmingId(null);
      });
  }

  if (authError) return <CenteredMessage>This app must be opened from your Shopify admin.</CenteredMessage>;
  if (loadError) return <CenteredMessage>Couldn&rsquo;t load: {loadError}</CenteredMessage>;
  if (!data) return <CenteredMessage>Loading…</CenteredMessage>;

  const lastPage = Math.max(0, Math.ceil(data.total / data.pageSize) - 1);

  return (
    <main className="dml-main">
      <div className="dml-grid">
        <section className="dml-card dml-card-wide">
          <h2 className="dml-card-title">Customers</h2>
          <p className="dml-card-hint">
            Every logged-in customer who has played, newest-active first &mdash; name and email are looked up live from
            Shopify, falling back to the bare customer ID if that lookup isn&rsquo;t available. Guest games (no
            customer account) aren&rsquo;t attributed to anyone and don&rsquo;t appear here. Reset permanently deletes
            a customer&rsquo;s games, unlocked achievements, and saved birthday for this shop &mdash; e.g. to clear a
            support or test account so achievements can be earned again.
          </p>
          {data.customers.length === 0 ? (
            <p className="dml-empty">No customers have played yet.</p>
          ) : (
            <ul className="dml-recent-list">
              {data.customers.map((c) => {
                const d = new Date(c.lastPlayedAt);
                const when = `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}.${d.getFullYear()}`;
                const isConfirming = confirmingId === c.customerId;
                const isResetting = resettingId === c.customerId;
                const msg = resetMsg?.id === c.customerId ? resetMsg : null;
                return (
                  <li key={c.customerId} className="dml-recent-row">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div>
                        <p className="dml-recent-title" style={{ marginBottom: 2 }}>
                          {c.displayName || `Customer ${c.customerId}`}
                        </p>
                        <span className="dml-recent-date">
                          {c.displayName ? `${c.email || c.customerId} · ` : ""}
                          {c.gamesPlayed} game{c.gamesPlayed === 1 ? "" : "s"} &middot; {c.achievementsUnlocked} achievement{c.achievementsUnlocked === 1 ? "" : "s"} &middot; last played {when}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {!isConfirming ? (
                          <button
                            type="button" className="dml-btn-secondary dml-btn-sm" style={{ flex: "none" }}
                            onClick={() => { setConfirmingId(c.customerId); setResetMsg(null); }}
                          >
                            Reset&hellip;
                          </button>
                        ) : (
                          <>
                            <span style={{ fontSize: 12, color: "#d72c0d", fontWeight: 600 }}>Delete everything?</span>
                            <button
                              type="button" className="dml-btn-primary dml-btn-sm" style={{ flex: "none", background: "#d72c0d" }}
                              disabled={isResetting}
                              onClick={() => resetCustomer(c.customerId)}
                            >
                              {isResetting ? "Deleting…" : "Yes, delete"}
                            </button>
                            <button
                              type="button" className="dml-btn-ghost dml-btn-sm" style={{ flex: "none" }}
                              disabled={isResetting}
                              onClick={() => setConfirmingId(null)}
                            >
                              Cancel
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    {msg && (
                      <p className={msg.ok ? "dml-msg-ok" : "dml-msg-err"} style={{ marginTop: 8, marginBottom: 0 }}>
                        {msg.text}
                      </p>
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
      </div>
    </main>
  );
}
