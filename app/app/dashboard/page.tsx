"use client";

import { useEffect, useState } from "react";
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
  score_60_plus: "A player scores 60+ (threshold editable)",
  players_5_6: "Game played with 5–6 players",
  meaning_10_plus: "10+ Meaning of Life bonus (threshold editable)",
  drop_of_life_50_plus: "50+ Drop of Life points (off until client confirms rule)",
};

interface Summary {
  shop: string;
  totalGames: number;
  gamesLast30Days: number;
  gamesWithCustomer: number;
}

const card: React.CSSProperties = {
  background: "#fff", border: "1px solid #e1e3e5", borderRadius: 12,
  padding: 20, marginBottom: 16,
};
const label: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 };
const input: React.CSSProperties = {
  width: "100%", padding: "8px 10px", fontSize: 14,
  border: "1px solid #c9cccf", borderRadius: 8, marginBottom: 12,
};

export default function Dashboard() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [authError, setAuthError] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadErr, setUploadErr] = useState("");

  useEffect(() => {
    authedFetch("/api/admin/settings").then((r) => {
      if (r.status === 401) { setAuthError(true); return; }
      return r.json();
    }).then((d) => d && setSettings(d.settings ?? null))
      .catch((e) => setLoadError(String(e?.message ?? e)));
    authedFetch("/api/admin/summary").then((r) => {
      if (r.status === 401) { setAuthError(true); return; }
      return r.json();
    }).then((d) => d && setSummary(d.shop ? d : null))
      .catch((e) => setLoadError(String(e?.message ?? e)));
  }, []);

  async function save() {
    if (!settings) return;
    setSaving(true);
    setMsg("");
    const res = await authedFetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    const d = await res.json();
    setSaving(false);
    if (d.settings) { setSettings(d.settings); setMsg("Saved."); }
    else setMsg(d.error ?? "Save failed.");
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

  if (authError) return <main style={{ padding: 40 }}>This app must be opened from your Shopify admin.</main>;
  if (loadError) return <main style={{ padding: 40 }}>Couldn&rsquo;t load: {loadError}</main>;
  if (!settings) return <main style={{ padding: 40 }}>Loading…</main>;

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 22, margin: "12px 0 20px" }}>DML Score — Dashboard</h1>

      {summary && (
        <div style={card}>
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>Activity</h2>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <Stat label="Games logged" value={summary.totalGames} />
            <Stat label="Last 30 days" value={summary.gamesLast30Days} />
            <Stat label="By logged-in customers" value={summary.gamesWithCustomer} />
          </div>
        </div>
      )}

      <div style={card}>
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Points</h2>
        <label style={label}>Points per game logged (customers only)</label>
        <input
          style={input} type="number" min={0} value={settings.pointsPerGame}
          onChange={(e) => setSettings({ ...settings, pointsPerGame: Number(e.target.value) })}
        />
      </div>

      <div style={card}>
        <h2 style={{ fontSize: 16, marginBottom: 4 }}>Milestone bonuses</h2>
        <p style={{ fontSize: 13, color: "#6d7175", marginBottom: 12 }}>
          Awarded automatically when a logged game qualifies (server-checked, once per game).
        </p>
        {Object.entries(settings.milestones).map(([key, rule]) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderTop: "1px solid #f1f2f3" }}>
            <input
              type="checkbox" checked={rule.enabled}
              onChange={(e) => setSettings({
                ...settings,
                milestones: { ...settings.milestones, [key]: { ...rule, enabled: e.target.checked } },
              })}
            />
            <span style={{ flex: 1, fontSize: 13 }}>{MILESTONE_NAMES[key] ?? key}</span>
            {rule.threshold !== undefined && (
              <input
                style={{ ...input, width: 70, marginBottom: 0 }} type="number" min={1} value={rule.threshold}
                title="Threshold"
                onChange={(e) => setSettings({
                  ...settings,
                  milestones: { ...settings.milestones, [key]: { ...rule, threshold: Number(e.target.value) } },
                })}
              />
            )}
            <input
              style={{ ...input, width: 70, marginBottom: 0 }} type="number" min={0} value={rule.points}
              title="Points"
              onChange={(e) => setSettings({
                ...settings,
                milestones: { ...settings.milestones, [key]: { ...rule, points: Number(e.target.value) } },
              })}
            />
            <span style={{ fontSize: 12, color: "#6d7175" }}>pts</span>
          </div>
        ))}
      </div>

      <div style={card}>
        <h2 style={{ fontSize: 16, marginBottom: 4 }}>Images</h2>
        <p style={{ fontSize: 13, color: "#6d7175", marginBottom: 12 }}>
          Replace any art asset with your own. Leave blank to use the built-in default.
          Uploads take effect after you click Save settings below.
        </p>
        {uploadErr && <p style={{ fontSize: 13, color: "#d72c0d", marginBottom: 12 }}>{uploadErr}</p>}
        {IMAGE_FIELDS.map(({ key, label: fieldLabel }) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: "1px solid #f1f2f3" }}>
            {settings.images[key] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.images[key]} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6, border: "1px solid #e1e3e5" }} />
            ) : (
              <div style={{ width: 44, height: 44, borderRadius: 6, border: "1px dashed #c9cccf", flexShrink: 0 }} />
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{fieldLabel}</div>
              <div style={{ fontSize: 12, color: "#6d7175" }}>{settings.images[key] ? "Custom image" : "Using default"}</div>
            </div>
            <label style={{
              padding: "6px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer",
              background: "#f1f2f3", borderRadius: 8,
            }}>
              {uploading === key ? "Uploading…" : "Upload"}
              <input
                type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }}
                disabled={uploading !== null}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(key, f); e.target.value = ""; }}
              />
            </label>
            {settings.images[key] && (
              <button
                type="button" onClick={() => clearImage(key)}
                style={{ padding: "6px 10px", fontSize: 13, background: "none", border: "1px solid #c9cccf", borderRadius: 8, cursor: "pointer" }}
              >
                Reset
              </button>
            )}
          </div>
        ))}
      </div>

      <div style={card}>
        <h2 style={{ fontSize: 16, marginBottom: 4 }}>"Guess Who Won?" mini-game</h2>
        <p style={{ fontSize: 13, color: "#6d7175", marginBottom: 12 }}>
          Offered before the reveal on close games only, to logged-in customers, every Nth game.
        </p>
        <label style={{ ...label, display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox" checked={settings.guessEnabled}
            onChange={(e) => setSettings({ ...settings, guessEnabled: e.target.checked })}
          />
          Enabled
        </label>
        <label style={label}>Points for a correct guess</label>
        <input
          style={input} type="number" min={0} value={settings.guessPoints}
          onChange={(e) => setSettings({ ...settings, guessPoints: Number(e.target.value) })}
        />
        <label style={label}>Max point gap for a “close game”</label>
        <input
          style={input} type="number" min={0} value={settings.guessGapMax}
          onChange={(e) => setSettings({ ...settings, guessGapMax: Number(e.target.value) })}
        />
        <label style={label}>Offer every Nth logged game</label>
        <input
          style={input} type="number" min={1} value={settings.guessEveryN}
          onChange={(e) => setSettings({ ...settings, guessEveryN: Number(e.target.value) })}
        />
      </div>

      <button
        onClick={save} disabled={saving}
        style={{
          padding: "10px 22px", fontSize: 15, fontWeight: 600, cursor: "pointer",
          background: "#008060", color: "#fff", border: 0, borderRadius: 8,
        }}
      >
        {saving ? "Saving…" : "Save settings"}
      </button>
      {msg && <span style={{ marginLeft: 12, fontSize: 14, color: "#6d7175" }}>{msg}</span>}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div style={{ fontSize: 26, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 13, color: "#6d7175" }}>{label}</div>
    </div>
  );
}
