"use client";

import { useEffect, useMemo, useState } from "react";
import { authedFetch } from "@/lib/hooks/useAuthedFetch";
import { CenteredMessage } from "@/components/admin/AdminUI";
import {
  ACHIEVEMENT_KEYS,
  DEFAULT_ACHIEVEMENTS,
  type AchievementConfig,
  type AchievementDef,
  type AchievementKey,
} from "@/lib/score/achievements";

interface Settings {
  achievements: AchievementConfig;
  guessEnabled: boolean;
  guessGapMax: number;
  guessEveryN: number;
  images: Record<string, string>;
  tipText: string;
  logoWidth: number;
  cardMinHeight: number;
  winnerImageSize: number;
}

const IMAGE_FIELDS: { key: string; label: string }[] = [
  { key: "logo", label: "Home screen logo" },
  { key: "winner", label: "Winner reveal art" },
  { key: "bg", label: "Background (main screens)" },
  { key: "bgExp", label: "Background (expansion-points screen)" },
  { key: "bgWinner", label: "Background (winner reveal screen)" },
];

// Bee/fish welcome-screen Doomlings, split into normal + hover states so a
// later frontend pass can animate each independently (continuous bob at
// different speeds, staggered pop-in). This settings page only stores the
// art; the animation itself is a separate pass over extensions/score-tool/.
const CHARACTER_IMAGE_FIELDS: { key: string; label: string }[] = [
  { key: "beeNormal", label: "Bee Doomling — normal" },
  { key: "beeHover", label: "Bee Doomling — hover (bob peak)" },
  { key: "fishNormal", label: "Fish Doomling — normal" },
  { key: "fishHover", label: "Fish Doomling — hover (bob peak)" },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [authError, setAuthError] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadErr, setUploadErr] = useState("");

  useEffect(() => {
    authedFetch("/api/admin/settings").then(async (r) => {
      if (r.status === 401) { setAuthError(true); return; }
      const d = await r.json().catch(() => null);
      if (d?.settings) { setSettings(d.settings); setSaved(d.settings); return; }
      throw new Error(d?.error ?? `Server returned ${r.status}`);
    }).catch((e) => setLoadError(String(e?.message ?? e)));
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

  function patchAchievement(key: AchievementKey, patch: Partial<AchievementDef>) {
    if (!settings) return;
    const current = settings.achievements[key] ?? DEFAULT_ACHIEVEMENTS[key];
    setSettings({
      ...settings,
      achievements: { ...settings.achievements, [key]: { ...current, ...patch } },
    });
  }

  async function uploadAchievementIcon(key: AchievementKey, file: File) {
    if (!settings) return;
    const uploadId = `achv:${key}`;
    setUploading(uploadId);
    setUploadErr("");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("imageKey", `achievement:${key}`);
    const res = await authedFetch("/api/admin/upload", { method: "POST", body: fd });
    const d = await res.json();
    setUploading(null);
    if (d.url) {
      patchAchievement(key, { iconUrl: d.url });
    } else {
      setUploadErr(d.error ?? "Upload failed.");
    }
  }

  function clearAchievementIcon(key: AchievementKey) {
    patchAchievement(key, { iconUrl: null });
  }

  if (authError) return <CenteredMessage>This app must be opened from your Shopify admin.</CenteredMessage>;
  if (loadError) return <CenteredMessage>Couldn&rsquo;t load: {loadError}</CenteredMessage>;
  if (!settings) return <CenteredMessage>Loading…</CenteredMessage>;

  return (
    <>
      <div style={{
        background: "#fff", borderBottom: "1px solid #e1e3e5",
        padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
        maxWidth: 1120, margin: "0 auto", gap: 16, flexWrap: "wrap",
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#202223" }}>Settings</span>
        <div className="dml-savebar">
          {msg && <span className={msg.ok ? "dml-msg-ok" : "dml-msg-err"}>{msg.text}</span>}
          {!msg && dirty && <span className="dml-msg-dirty">Unsaved changes</span>}
          <button className="dml-btn-primary" onClick={save} disabled={saving || !dirty}>
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
      </div>

      <main className="dml-main">
        <div className="dml-grid">
          <section className="dml-card">
            <h2 className="dml-card-title">&ldquo;Guess Who Won?&rdquo; mini-game</h2>
            <p className="dml-card-hint">
              Offered before the reveal on close games only, to logged-in customers, every Nth game.
              No points payout &mdash; just the guess/reveal moment.
            </p>
            <label className="dml-checkbox-row">
              <input
                type="checkbox" checked={settings.guessEnabled}
                onChange={(e) => setSettings({ ...settings, guessEnabled: e.target.checked })}
              />
              Enabled
            </label>
            <div className="dml-field-row" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
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
            <h2 className="dml-card-title">Achievements</h2>
            <p className="dml-card-hint">
              20 fixed achievement triggers. Toggle which are active and customize the name, icon, and
              description &mdash; description is an admin-only reminder of the trigger condition, players
              never see it (names/icons stay hidden until unlocked).
            </p>
            {uploadErr && <p className="dml-msg-err" style={{ marginBottom: 12 }}>{uploadErr}</p>}
            <div className="dml-achv-list">
              {ACHIEVEMENT_KEYS.map((key) => {
                const achv = settings.achievements[key] ?? DEFAULT_ACHIEVEMENTS[key];
                const uploadId = `achv:${key}`;
                return (
                  <div className="dml-achv-row" key={key}>
                    <input
                      type="checkbox" checked={achv.enabled}
                      onChange={(e) => patchAchievement(key, { enabled: e.target.checked })}
                    />
                    <div className="dml-achv-icon">
                      <div className="dml-achv-icon-thumb">
                        {achv.iconUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={achv.iconUrl} alt="" />
                        ) : (
                          <span className="dml-image-placeholder">?</span>
                        )}
                      </div>
                      <div className="dml-achv-icon-actions">
                        <label className="dml-btn-secondary dml-btn-sm">
                          {uploading === uploadId ? "…" : "Upload"}
                          <input
                            type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }}
                            disabled={uploading !== null}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) uploadAchievementIcon(key, f);
                              e.target.value = "";
                            }}
                          />
                        </label>
                        {achv.iconUrl && (
                          <button
                            type="button" className="dml-btn-ghost dml-btn-sm"
                            onClick={() => clearAchievementIcon(key)}
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="dml-achv-fields">
                      <span className="dml-achv-key">{key}</span>
                      <input
                        className="dml-input" type="text" maxLength={60} value={achv.name}
                        onChange={(e) => patchAchievement(key, { name: e.target.value })}
                      />
                      <textarea
                        className="dml-textarea" maxLength={200} rows={2} value={achv.description}
                        onChange={(e) => patchAchievement(key, { description: e.target.value })}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="dml-card dml-card-wide">
            <h2 className="dml-card-title">Home screen</h2>
            <div className="dml-field-row">
              <div>
                <label className="dml-label">Logo width (px)</label>
                <input
                  className="dml-input dml-input-sm" type="number" min={40} max={600} value={settings.logoWidth}
                  onChange={(e) => setSettings({ ...settings, logoWidth: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="dml-label">Card minimum height (px)</label>
                <input
                  className="dml-input dml-input-sm" type="number" min={300} max={1200} value={settings.cardMinHeight}
                  onChange={(e) => setSettings({ ...settings, cardMinHeight: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="dml-label">Winner image size (px)</label>
                <input
                  className="dml-input dml-input-sm" type="number" min={100} max={500} value={settings.winnerImageSize}
                  onChange={(e) => setSettings({ ...settings, winnerImageSize: Number(e.target.value) })}
                />
              </div>
            </div>
            <p className="dml-card-hint" style={{ marginTop: -4 }}>
              How tall every screen of the tool is at minimum — a game with more players just grows past
              this instead of scrolling, so raise it if your players usually have big groups.
            </p>
            <label className="dml-label" style={{ marginTop: 14 }}>
              Tip banner text (shown under the welcome card — leave blank to hide it)
            </label>
            <input
              className="dml-input" type="text" maxLength={280} value={settings.tipText}
              onChange={(e) => setSettings({ ...settings, tipText: e.target.value })}
            />
          </section>

          <section className="dml-card dml-card-wide">
            <h2 className="dml-card-title">Welcome screen characters</h2>
            <p className="dml-card-hint">
              Bee and fish Doomlings on the welcome screen bob up and down continuously and pop in one at a
              time on page load. Each needs its own normal and hover-peak art since they animate independently
              &mdash; leave blank to use the built-in default.
            </p>
            {uploadErr && <p className="dml-msg-err" style={{ marginBottom: 12 }}>{uploadErr}</p>}
            <div className="dml-image-grid">
              {CHARACTER_IMAGE_FIELDS.map(({ key, label: fieldLabel }) => (
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
    </>
  );
}
