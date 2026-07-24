"use client";

import { useEffect, useMemo, useState } from "react";
import { authedFetch } from "@/lib/hooks/useAuthedFetch";

interface MilestoneRule {
  enabled: boolean;
  points: number;
  threshold?: number;
}

interface Settings {
  pointsPerGame: number;
  milestones: Record<string, MilestoneRule>;
  guessEnabled: boolean;
  guessPoints: number;
  guessGapMax: number;
  guessEveryN: number;
  images: Record<string, string>;
}

const IMAGE_FIELDS: { key: string; label: string }[] = [
  { key: "characters", label: "Welcome screen character art" },
  { key: "winner", label: "Winner reveal art" },
  { key: "bg", label: "Background (main screens)" },
  { key: "bgExp", label: "Background (expansion-points screen)" },
  { key: "worldsend", label: "World's End symbol icon" },
  { key: "compass", label: "Compass Star icon" },
  { key: "drop", label: "Drop of Life icon" },
  { key: "suppress", label: "Suppress icon" },
];

const MILESTONE_NAMES: Record<string, string> = {
  first_game: "First game logged",
  score_60_plus: "A player scores 60+",
  players_5_6: "Game played with 5–6 players",
  meaning_10_plus: "10+ Meaning of Life bonus",
  drop_of_life_50_plus: "50+ Drop of Life points (off until client confirms rule)",
};

interface Summary {
  shop: string;
  totalGames: number;
  gamesLast30Days: number;
  gamesWithCustomer: number;
}

export default function Dashboard() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState<Settings | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [authError, setAuthError] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadErr, setUploadErr] = useState("");

  useEffect(() => {
    authedFetch("/api/admin/settings").then((r) => {
      if (r.status === 401) { setAuthError(true); return; }
      return r.json();
    }).then((d) => {
      if (d?.settings) { setSettings(d.settings); setSaved(d.settings); }
    }).catch((e) => setLoadError(String(e?.message ?? e)));
    authedFetch("/api/admin/summary").then((r) => {
      if (r.status === 401) { setAuthError(true); return; }
      return r.json();
    }).then((d) => d && setSummary(d.shop ? d : null))
      .catch((e) => setLoadError(String(e?.message ?? e)));
  }, []);

  const dirty = useMemo(
    () => !!settings && !!saved && JSON.stringify(settings) !== JSON.stringify(saved),
    [settings, saved]
  );

  async function save() {
    if (!settings) return;
    setSaving(true);
    setMsg(null);
    const res = await authedFetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    const d = await res.json();
    setSaving(false);
    if (d.settings) {
      setSettings(d.settings);
      setSaved(d.settings);
      setMsg({ text: "Settings saved.", ok: true });
    } else {
      setMsg({ text: d.error ?? "Save failed.", ok: false });
    }
  }

  async function uploadImage(key: string, file: File) {
    if (!settings) return;
    setUploading(key);
    setUploadErr("");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("imageKey", key);
    const res = await authedFetch("/api/admin/upload", { method: "POST", body: fd });
    const d = await res.json();
    setUploading(null);
    if (d.url) {
      setSettings({ ...settings, images: { ...settings.images, [key]: d.url } });
    } else {
      setUploadErr(d.error ?? "Upload failed.");
    }
  }

  function clearImage(key: string) {
    if (!settings) return;
    setSettings({ ...settings, images: { ...settings.images, [key]: "" } });
  }

  if (authError) return <CenteredMessage>This app must be opened from your Shopify admin.</CenteredMessage>;
  if (loadError) return <CenteredMessage>Couldn&rsquo;t load: {loadError}</CenteredMessage>;
  if (!settings) return <CenteredMessage>Loading…</CenteredMessage>;

  return (
    <div style={{ background: "#f4f5f7", minHeight: "100vh" }}>
      <GlobalStyle />

      <div className="dml-topbar">
        <div className="dml-topbar-inner">
          <div>
            <h1 className="dml-title">DML Score</h1>
            <p className="dml-subtitle">Points, milestones, and art for the score tool.</p>
          </div>
          <div className="dml-savebar">
            {msg && <span className={msg.ok ? "dml-msg-ok" : "dml-msg-err"}>{msg.text}</span>}
            {!msg && dirty && <span className="dml-msg-dirty">Unsaved changes</span>}
            <button
              className="dml-btn-primary"
              onClick={save}
              disabled={saving || !dirty}
            >
              {saving ? "Saving…" : "Save settings"}
            </button>
          </div>
        </div>
      </div>

      <main className="dml-main">
        {summary && (
          <section className="dml-card dml-card-wide">
            <h2 className="dml-card-title">Activity</h2>
            <div className="dml-stats">
              <Stat label="Games logged" value={summary.totalGames} />
              <Stat label="Last 30 days" value={summary.gamesLast30Days} />
              <Stat label="By logged-in customers" value={summary.gamesWithCustomer} />
            </div>
          </section>
        )}

        <div className="dml-grid">
          <section className="dml-card">
            <h2 className="dml-card-title">Points</h2>
            <label className="dml-label">Points per game logged (customers only)</label>
            <input
              className="dml-input" type="number" min={0} value={settings.pointsPerGame}
              onChange={(e) => setSettings({ ...settings, pointsPerGame: Number(e.target.value) })}
            />
          </section>

          <section className="dml-card">
            <h2 className="dml-card-title">&ldquo;Guess Who Won?&rdquo; mini-game</h2>
            <p className="dml-card-hint">
              Offered before the reveal on close games only, to logged-in customers, every Nth game.
            </p>
            <label className="dml-checkbox-row">
              <input
                type="checkbox" checked={settings.guessEnabled}
                onChange={(e) => setSettings({ ...settings, guessEnabled: e.target.checked })}
              />
              Enabled
            </label>
            <div className="dml-field-row">
              <div>
                <label className="dml-label">Points for a correct guess</label>
                <input
                  className="dml-input" type="number" min={0} value={settings.guessPoints}
                  onChange={(e) => setSettings({ ...settings, guessPoints: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="dml-label">Max gap for a &ldquo;close game&rdquo;</label>
                <input
                  className="dml-input" type="number" min={0} value={settings.guessGapMax}
                  onChange={(e) => setSettings({ ...settings, guessGapMax: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="dml-label">Offer every Nth game</label>
                <input
                  className="dml-input" type="number" min={1} value={settings.guessEveryN}
                  onChange={(e) => setSettings({ ...settings, guessEveryN: Number(e.target.value) })}
                />
              </div>
            </div>
          </section>

          <section className="dml-card dml-card-wide">
            <h2 className="dml-card-title">Milestone bonuses</h2>
            <p className="dml-card-hint">
              Awarded automatically when a logged game qualifies (server-checked, once per game).
            </p>
            <div className="dml-milestone-table">
              <div className="dml-milestone-head">
                <span></span>
                <span>Milestone</span>
                <span>Threshold</span>
                <span>Points</span>
              </div>
              {Object.entries(settings.milestones).map(([key, rule]) => (
                <div className="dml-milestone-row" key={key}>
                  <input
                    type="checkbox" checked={rule.enabled}
                    onChange={(e) => setSettings({
                      ...settings,
                      milestones: { ...settings.milestones, [key]: { ...rule, enabled: e.target.checked } },
                    })}
                  />
                  <span className="dml-milestone-name">{MILESTONE_NAMES[key] ?? key}</span>
                  {rule.threshold !== undefined ? (
                    <input
                      className="dml-input dml-input-sm" type="number" min={1} value={rule.threshold}
                      onChange={(e) => setSettings({
                        ...settings,
                        milestones: { ...settings.milestones, [key]: { ...rule, threshold: Number(e.target.value) } },
                      })}
                    />
                  ) : <span />}
                  <input
                    className="dml-input dml-input-sm" type="number" min={0} value={rule.points}
                    onChange={(e) => setSettings({
                      ...settings,
                      milestones: { ...settings.milestones, [key]: { ...rule, points: Number(e.target.value) } },
                    })}
                  />
                </div>
              ))}
            </div>
          </section>

          <section className="dml-card dml-card-wide">
            <h2 className="dml-card-title">Images</h2>
            <p className="dml-card-hint">
              Replace any art asset with your own. Leave blank to use the built-in default.
            </p>
            {uploadErr && <p className="dml-msg-err" style={{ marginBottom: 12 }}>{uploadErr}</p>}
            <div className="dml-image-grid">
              {IMAGE_FIELDS.map(({ key, label: fieldLabel }) => (
                <div className="dml-image-tile" key={key}>
                  <div className="dml-image-thumb">
                    {settings.images[key] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={settings.images[key]} alt="" />
                    ) : (
                      <span className="dml-image-placeholder">Default</span>
                    )}
                  </div>
                  <div className="dml-image-name">{fieldLabel}</div>
                  <div className="dml-image-actions">
                    <label className="dml-btn-secondary dml-btn-sm">
                      {uploading === key ? "Uploading…" : "Upload"}
                      <input
                        type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }}
                        disabled={uploading !== null}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(key, f); e.target.value = ""; }}
                      />
                    </label>
                    {settings.images[key] && (
                      <button type="button" className="dml-btn-ghost dml-btn-sm" onClick={() => clearImage(key)}>
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="dml-stat">
      <div className="dml-stat-value">{value}</div>
      <div className="dml-stat-label">{label}</div>
    </div>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ fontSize: 15, color: "#6d7175" }}>{children}</p>
    </div>
  );
}

function GlobalStyle() {
  return (
    <style>{`
      .dml-topbar { position: sticky; top: 0; z-index: 10; background: #fff; border-bottom: 1px solid #e1e3e5; }
      .dml-topbar-inner {
        max-width: 1120px; margin: 0 auto; padding: 18px 24px;
        display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
      }
      .dml-title { font-size: 20px; font-weight: 700; margin: 0; color: #202223; }
      .dml-subtitle { font-size: 13px; color: #6d7175; margin: 2px 0 0; }
      .dml-savebar { display: flex; align-items: center; gap: 12px; }
      .dml-msg-ok { font-size: 13px; color: #008060; font-weight: 600; }
      .dml-msg-err { font-size: 13px; color: #d72c0d; font-weight: 600; }
      .dml-msg-dirty { font-size: 13px; color: #8a6116; font-weight: 600; }

      .dml-main { max-width: 1120px; margin: 0 auto; padding: 24px; }

      .dml-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: 20px; align-items: start; }
      .dml-card {
        background: #fff; border: 1px solid #e1e3e5; border-radius: 12px;
        padding: 22px; box-shadow: 0 1px 2px rgba(0,0,0,0.03);
      }
      .dml-card-wide { grid-column: 1 / -1; }
      .dml-card-title { font-size: 15px; font-weight: 700; margin: 0 0 4px; color: #202223; }
      .dml-card-hint { font-size: 13px; color: #6d7175; margin: 0 0 16px; }

      .dml-label { display: block; font-size: 12px; font-weight: 600; color: #4a4d52; margin-bottom: 6px; }
      .dml-input {
        width: 100%; padding: 9px 11px; font-size: 14px;
        border: 1px solid #c9cccf; border-radius: 8px; transition: border-color 0.15s, box-shadow 0.15s;
      }
      .dml-input:focus { outline: none; border-color: #008060; box-shadow: 0 0 0 3px rgba(0,128,96,0.12); }
      .dml-input-sm { width: 100%; }
      .dml-field-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 14px; }

      .dml-checkbox-row { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #202223; }

      .dml-stats { display: flex; gap: 32px; flex-wrap: wrap; }
      .dml-stat-value { font-size: 28px; font-weight: 700; color: #202223; }
      .dml-stat-label { font-size: 13px; color: #6d7175; margin-top: 2px; }

      .dml-milestone-table { display: flex; flex-direction: column; }
      .dml-milestone-head, .dml-milestone-row {
        display: grid; grid-template-columns: 28px 1fr 90px 90px; gap: 12px; align-items: center;
      }
      .dml-milestone-head { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #8a8d91; padding: 0 0 8px; }
      .dml-milestone-row { padding: 12px 0; border-top: 1px solid #f1f2f3; }
      .dml-milestone-name { font-size: 13px; color: #202223; }

      .dml-image-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 16px; }
      .dml-image-tile { display: flex; flex-direction: column; gap: 8px; }
      .dml-image-thumb {
        width: 100%; aspect-ratio: 1; border-radius: 10px; overflow: hidden;
        background: #f6f6f7; border: 1px solid #e1e3e5; display: flex; align-items: center; justify-content: center;
      }
      .dml-image-thumb img { width: 100%; height: 100%; object-fit: cover; }
      .dml-image-placeholder { font-size: 11px; color: #a1a4a8; font-weight: 600; }
      .dml-image-name { font-size: 12px; font-weight: 600; color: #202223; line-height: 1.3; min-height: 32px; }
      .dml-image-actions { display: flex; gap: 6px; }

      .dml-btn-primary, .dml-btn-secondary, .dml-btn-ghost {
        font-size: 13px; font-weight: 600; cursor: pointer; border-radius: 8px;
        transition: background 0.15s, opacity 0.15s; white-space: nowrap;
      }
      .dml-btn-primary { padding: 10px 20px; background: #008060; color: #fff; border: 0; }
      .dml-btn-primary:hover:not(:disabled) { background: #006e52; }
      .dml-btn-primary:disabled { opacity: 0.5; cursor: default; }
      .dml-btn-secondary { padding: 7px 12px; background: #f1f2f3; color: #202223; border: 0; text-align: center; }
      .dml-btn-secondary:hover { background: #e4e5e7; }
      .dml-btn-ghost { padding: 7px 10px; background: none; color: #202223; border: 1px solid #c9cccf; }
      .dml-btn-ghost:hover { background: #f6f6f7; }
      .dml-btn-sm { flex: 1; }

      @media (max-width: 700px) {
        .dml-field-row { grid-template-columns: 1fr; }
        .dml-milestone-head { display: none; }
        .dml-milestone-row { grid-template-columns: 24px 1fr; row-gap: 8px; }
        .dml-milestone-row input[type="number"] { grid-column: 2; width: 90px; }
      }
    `}</style>
  );
}
