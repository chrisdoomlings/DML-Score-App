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
import { STEP_KEYS, DEFAULT_STEPS, type StepConfig, type StepKey } from "@/lib/score/steps";

interface Settings {
  achievements: AchievementConfig;
  steps: StepConfig;
  guessEnabled: boolean;
  guessGapMax: number;
  guessEveryN: number;
  images: Record<string, string>;
  tipText: string;
  homeHeading: string;
  homeSubheading: string;
  discordUrl: string;
  trophyHeading: string;
  trophySubheading: string;
  trophyTagline: string;
  trophyActionsBg: string;
  trophyTopImages: string[];
  logoWidth: number;
  cardMinHeight: number;
  winnerImageSize: number;
  charactersWidth: number;
  headingWidth: number;
  headingFontSize: number;
}

interface LibraryImage {
  key: string;
  url: string;
  uploadedAt: string;
}

type Tab = "general" | "welcome" | "steps" | "winner" | "trophy";

const TABS: { key: Tab; label: string }[] = [
  { key: "general", label: "General" },
  { key: "welcome", label: "Welcome" },
  { key: "steps", label: "Steps" },
  { key: "winner", label: "Winner" },
  { key: "trophy", label: "Trophy" },
];

// One image field per step, keyed to its score_settings.images slot —
// bgExp already existed (expansion-points screen); bgWe/bgFv/bgBp are new.
const STEP_META: { key: StepKey; label: string; imageKey: string }[] = [
  { key: "we", label: "World's End", imageKey: "bgWe" },
  { key: "fv", label: "Face Value", imageKey: "bgFv" },
  { key: "bp", label: "Bonus Points", imageKey: "bgBp" },
  { key: "mp", label: "Expansion Points", imageKey: "bgExp" },
];

const GENERAL_IMAGE_FIELDS: { key: string; label: string }[] = [
  { key: "logo", label: "Logo (shown on both the welcome screen and the winner reveal screen)" },
  { key: "bg", label: "Background (main screens, used as the fallback for any step with no image of its own)" },
];

const WELCOME_IMAGE_FIELDS: { key: string; label: string }[] = [
  { key: "characters", label: "Home screen character illustration" },
];

const WINNER_IMAGE_FIELDS: { key: string; label: string }[] = [
  { key: "winner", label: "Winner reveal art" },
  { key: "bgWinner", label: "Background (winner reveal screen)" },
  { key: "winnerFooter", label: "Bottom banner image (shown at the very bottom of the winner screen — leave blank to hide it)" },
];

const TROPHY_IMAGE_FIELDS: { key: string; label: string }[] = [
  { key: "trophyBg", label: "Background (trophy screen)" },
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
  const [tab, setTab] = useState<Tab>("general");
  const [stepTab, setStepTab] = useState<StepKey>("we");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [authError, setAuthError] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadErr, setUploadErr] = useState("");
  const [pickerFor, setPickerFor] = useState<string | null>(null); // image key (or "achv:<key>") currently browsing for
  const [library, setLibrary] = useState<LibraryImage[] | null>(null);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryErr, setLibraryErr] = useState("");

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

  // Trophy top-illustration pool — every upload appends (score_settings.trophy_top_images
  // is an array; the storefront picks one at random per "Generate Trophy").
  async function uploadTrophyTopImage(file: File) {
    if (!settings) return;
    setUploading("trophyTopPool");
    setUploadErr("");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("imageKey", "trophyTopPool");
    const res = await authedFetch("/api/admin/upload", { method: "POST", body: fd });
    const d = await res.json();
    setUploading(null);
    if (d.url) {
      setSettings({ ...settings, trophyTopImages: [...settings.trophyTopImages, d.url] });
    } else {
      setUploadErr(d.error ?? "Upload failed.");
    }
  }

  function removeTrophyTopImage(index: number) {
    if (!settings) return;
    setSettings({ ...settings, trophyTopImages: settings.trophyTopImages.filter((_, i) => i !== index) });
  }

  function patchAchievement(key: AchievementKey, patch: Partial<AchievementDef>) {
    if (!settings) return;
    const current = settings.achievements[key] ?? DEFAULT_ACHIEVEMENTS[key];
    setSettings({
      ...settings,
      achievements: { ...settings.achievements, [key]: { ...current, ...patch } },
    });
  }

  function patchStep(key: StepKey, patch: Partial<StepConfig[StepKey]>) {
    if (!settings) return;
    const current = settings.steps[key] ?? DEFAULT_STEPS[key];
    setSettings({
      ...settings,
      steps: { ...settings.steps, [key]: { ...current, ...patch } },
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

  function openPicker(key: string) {
    setPickerFor(key);
    if (library === null && !libraryLoading) {
      setLibraryLoading(true);
      setLibraryErr("");
      authedFetch("/api/admin/images").then(async (r) => {
        const d = await r.json().catch(() => null);
        setLibraryLoading(false);
        if (d?.images) setLibrary(d.images);
        else setLibraryErr(d?.error ?? "Couldn’t load your uploaded images.");
      }).catch((e) => { setLibraryLoading(false); setLibraryErr(String(e?.message ?? e)); });
    }
  }

  function selectFromLibrary(url: string) {
    if (pickerFor?.startsWith("achv:")) {
      patchAchievement(pickerFor.slice(5) as AchievementKey, { iconUrl: url });
    } else if (pickerFor === "trophyTopPool" && settings) {
      setSettings({ ...settings, trophyTopImages: [...settings.trophyTopImages, url] });
    } else if (pickerFor && settings) {
      setSettings({ ...settings, images: { ...settings.images, [pickerFor]: url } });
    }
    setPickerFor(null);
  }

  if (authError) return <CenteredMessage>This app must be opened from your Shopify admin.</CenteredMessage>;
  if (loadError) return <CenteredMessage>Couldn&rsquo;t load: {loadError}</CenteredMessage>;
  if (!settings) return <CenteredMessage>Loading…</CenteredMessage>;

  function imageGrid(fields: { key: string; label: string; fallbackSrc?: string; wide?: boolean }[]) {
    return (
      <div className="dml-image-grid">
        {fields.map(({ key, label: fieldLabel, fallbackSrc, wide }) => (
          <div className="dml-image-tile" key={key}>
            <div
              className={"dml-image-thumb" + (wide ? " dml-image-thumb-wide" : "")}
              style={wide && fallbackSrc ? { backgroundImage: `url(${fallbackSrc})` } : undefined}
            >
              {wide ? (
                // Overlay preview: shared background fills the wide frame
                // (set as the CSS background above), the character image (if
                // any) sits on top of it at its own aspect ratio — matching
                // how the storefront actually layers the two.
                settings!.images[key] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={settings!.images[key]} alt="" className="dml-image-overlay-img" />
                )
              ) : settings!.images[key] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={settings!.images[key]} alt="" />
              ) : fallbackSrc ? (
                // No image of its own — shows the shared background it
                // actually falls back to on the storefront, not a blank box,
                // so this preview matches what players will really see.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fallbackSrc} alt="" style={{ opacity: 0.6 }} />
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
              <button type="button" className="dml-btn-ghost dml-btn-sm" onClick={() => openPicker(key)}>
                Browse
              </button>
              {settings!.images[key] && (
                <button type="button" className="dml-btn-ghost dml-btn-sm" onClick={() => clearImage(key)}>
                  Reset
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

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

      <div className="dml-subtabs">
        {TABS.map((t) => (
          <button
            key={t.key} type="button"
            className={"dml-subtab-btn" + (tab === t.key ? " active" : "")}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <main className="dml-main">
        <div className="dml-grid">
          {tab === "general" && (
            <>
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

              <section className="dml-card">
                <h2 className="dml-card-title">Card minimum height</h2>
                <p className="dml-card-hint">
                  How tall every screen of the tool is at minimum — a game with more players just grows
                  past this instead of scrolling, so raise it if your players usually have big groups.
                </p>
                <label className="dml-label">Card minimum height (px)</label>
                <input
                  className="dml-input dml-input-sm" type="number" min={300} max={1200} value={settings.cardMinHeight}
                  onChange={(e) => setSettings({ ...settings, cardMinHeight: Number(e.target.value) })}
                />
              </section>

              <section className="dml-card dml-card-wide">
                <h2 className="dml-card-title">Achievements</h2>
                <p className="dml-card-hint">
                  21 fixed achievement triggers. Toggle which are active and customize the name, icon, and
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
                            <button type="button" className="dml-btn-ghost dml-btn-sm" onClick={() => openPicker(`achv:${key}`)}>
                              Browse
                            </button>
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
                <h2 className="dml-card-title">Shared images</h2>
                <p className="dml-card-hint">
                  Assets used across more than one screen, rather than scoped to a single tab. The logo appears
                  on both the welcome and winner screens (width is set on the Welcome tab); the background is the
                  fallback for the main scoring screens when a step has no image of its own. Leave either blank to
                  use the built-in default.
                </p>
                {uploadErr && <p className="dml-msg-err" style={{ marginBottom: 12 }}>{uploadErr}</p>}
                {imageGrid(GENERAL_IMAGE_FIELDS)}
              </section>
            </>
          )}

          {tab === "welcome" && (
            <>
              <section className="dml-card dml-card-wide">
                <h2 className="dml-card-title">Welcome screen text</h2>
                <div className="dml-field-row" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
                  <div>
                    <label className="dml-label">Logo width (px)</label>
                    <input
                      className="dml-input dml-input-sm" type="number" min={40} max={600} value={settings.logoWidth}
                      onChange={(e) => setSettings({ ...settings, logoWidth: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <label className="dml-label" style={{ marginTop: 14 }}>
                  Welcome screen heading (leave blank to use the theme block&rsquo;s default)
                </label>
                <input
                  className="dml-input" type="text" maxLength={120} value={settings.homeHeading}
                  onChange={(e) => setSettings({ ...settings, homeHeading: e.target.value })}
                />
                <label className="dml-label" style={{ marginTop: 14 }}>
                  Welcome screen subheading (shown under the heading — leave blank to hide it)
                </label>
                <input
                  className="dml-input" type="text" maxLength={200} value={settings.homeSubheading}
                  onChange={(e) => setSettings({ ...settings, homeSubheading: e.target.value })}
                />
                <label className="dml-label" style={{ marginTop: 14 }}>
                  Tip banner text (shown under the welcome card — leave blank to hide it)
                </label>
                <input
                  className="dml-input" type="text" maxLength={280} value={settings.tipText}
                  onChange={(e) => setSettings({ ...settings, tipText: e.target.value })}
                />
              </section>

              <section className="dml-card dml-card-wide">
                <h2 className="dml-card-title">Welcome screen layout</h2>
                <p className="dml-card-hint">
                  Size and position the character illustration and heading. The illustration can be made wider
                  than the card itself &mdash; it bleeds off both edges symmetrically and gets cropped there, it
                  never stretches the card.
                </p>
                <div className="dml-field-row" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                  <div>
                    <label className="dml-label">Character illustration width (px, unused — storefront is full-bleed)</label>
                    <input
                      className="dml-input dml-input-sm" type="number" min={60} max={900} value={settings.charactersWidth}
                      onChange={(e) => setSettings({ ...settings, charactersWidth: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="dml-label">Heading width (px)</label>
                    <input
                      className="dml-input dml-input-sm" type="number" min={100} max={600} value={settings.headingWidth}
                      onChange={(e) => setSettings({ ...settings, headingWidth: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="dml-label">Heading font size (px)</label>
                    <input
                      className="dml-input dml-input-sm" type="number" min={14} max={60} value={settings.headingFontSize}
                      onChange={(e) => setSettings({ ...settings, headingFontSize: Number(e.target.value) })}
                    />
                  </div>
                </div>
              </section>

              <section className="dml-card dml-card-wide">
                <h2 className="dml-card-title">Welcome screen characters</h2>
                <p className="dml-card-hint">
                  Bee and fish Doomlings on the welcome screen bob up and down continuously and pop in one at a
                  time on page load. Each needs its own normal and hover-peak art since they animate independently
                  &mdash; leave blank to use the built-in default.
                </p>
                {uploadErr && <p className="dml-msg-err" style={{ marginBottom: 12 }}>{uploadErr}</p>}
                {imageGrid(CHARACTER_IMAGE_FIELDS)}
              </section>

              <section className="dml-card dml-card-wide">
                <h2 className="dml-card-title">Images</h2>
                <p className="dml-card-hint">
                  Replace the welcome screen&rsquo;s art with your own. Leave blank to use the built-in default.
                </p>
                {uploadErr && <p className="dml-msg-err" style={{ marginBottom: 12 }}>{uploadErr}</p>}
                {imageGrid(WELCOME_IMAGE_FIELDS)}
              </section>
            </>
          )}

          {tab === "steps" && (
            <>
              <section className="dml-card dml-card-wide">
                <h2 className="dml-card-title">Scoring steps</h2>
                <p className="dml-card-hint">
                  Heading, description, and an optional character image for each of the 4 scoring screens. All 4
                  share one background (set on the General tab) — the character image, if set, layers on top of it.
                </p>
                <div className="dml-subtabs" style={{ padding: 0, margin: "0 0 18px" }}>
                  {STEP_META.map((s) => (
                    <button
                      key={s.key} type="button"
                      className={"dml-subtab-btn" + (stepTab === s.key ? " active" : "")}
                      onClick={() => setStepTab(s.key)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                {STEP_META.filter((s) => s.key === stepTab).map((s) => {
                  const step = settings.steps[s.key] ?? DEFAULT_STEPS[s.key];
                  return (
                    <div key={s.key}>
                      <label className="dml-label">Pre-heading (optional, small tag shown above the heading)</label>
                      <input
                        className="dml-input" type="text" maxLength={30} value={step.preHeading}
                        onChange={(e) => patchStep(s.key, { preHeading: e.target.value })}
                      />
                      <label className="dml-label" style={{ marginTop: 14 }}>Heading</label>
                      <input
                        className="dml-input" type="text" maxLength={80} value={step.heading}
                        onChange={(e) => patchStep(s.key, { heading: e.target.value })}
                      />
                      <label className="dml-label" style={{ marginTop: 14 }}>Description</label>
                      <textarea
                        className="dml-textarea" maxLength={300} rows={3} value={step.sub}
                        onChange={(e) => patchStep(s.key, { sub: e.target.value })}
                      />
                      <label className="dml-label" style={{ marginTop: 14 }}>
                        Character image (optional — layers on top of the shared background above, not a replacement for it)
                      </label>
                      {uploadErr && <p className="dml-msg-err" style={{ marginBottom: 12 }}>{uploadErr}</p>}
                      {imageGrid([{ key: s.imageKey, label: s.label + " character", fallbackSrc: settings.images.bg, wide: true }])}
                    </div>
                  );
                })}
              </section>
            </>
          )}

          {tab === "winner" && (
            <>
              <section className="dml-card dml-card-wide">
                <h2 className="dml-card-title">Winner screen</h2>
                <div className="dml-field-row" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
                  <div>
                    <label className="dml-label">Winner image size (px, unused — image is full-width)</label>
                    <input
                      className="dml-input dml-input-sm" type="number" min={100} max={500} value={settings.winnerImageSize}
                      onChange={(e) => setSettings({ ...settings, winnerImageSize: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <label className="dml-label" style={{ marginTop: 14 }}>
                  Discord invite link (shown on the winner screen — leave blank to hide the banner)
                </label>
                <input
                  className="dml-input" type="url" maxLength={300} placeholder="https://discord.gg/…"
                  value={settings.discordUrl}
                  onChange={(e) => setSettings({ ...settings, discordUrl: e.target.value })}
                />
              </section>

              <section className="dml-card dml-card-wide">
                <h2 className="dml-card-title">Images</h2>
                <p className="dml-card-hint">
                  Replace the winner reveal screen&rsquo;s art with your own. Leave blank to use the built-in default.
                </p>
                {uploadErr && <p className="dml-msg-err" style={{ marginBottom: 12 }}>{uploadErr}</p>}
                {imageGrid(WINNER_IMAGE_FIELDS)}
              </section>
            </>
          )}

          {tab === "trophy" && (
            <>
              <section className="dml-card dml-card-wide">
                <h2 className="dml-card-title">Trophy screen text</h2>
                <p className="dml-card-hint">
                  Shown on the &ldquo;Generate Trophy&rdquo; screen after the winner reveal.
                </p>
                <label className="dml-label">Heading (below the winner&rsquo;s name)</label>
                <input
                  className="dml-input" type="text" maxLength={120} value={settings.trophyHeading}
                  onChange={(e) => setSettings({ ...settings, trophyHeading: e.target.value })}
                />
                <label className="dml-label" style={{ marginTop: 14 }}>
                  Second line (shown between the other players&rsquo; names and the subheading &mdash; leave blank to hide it)
                </label>
                <input
                  className="dml-input" type="text" maxLength={120} value={settings.trophyTagline}
                  onChange={(e) => setSettings({ ...settings, trophyTagline: e.target.value })}
                />
                <label className="dml-label" style={{ marginTop: 14 }}>Subheading (below the other players&rsquo; names)</label>
                <input
                  className="dml-input" type="text" maxLength={60} value={settings.trophySubheading}
                  onChange={(e) => setSettings({ ...settings, trophySubheading: e.target.value })}
                />
              </section>

              <section className="dml-card dml-card-wide">
                <h2 className="dml-card-title">Action buttons area</h2>
                <p className="dml-card-hint">
                  Background behind the Rematch!/Or New Players/Achievements buttons, which sit below the
                  trophy art (revealed on scroll) and don&rsquo;t use its background image. Leave blank for
                  no color &mdash; the card&rsquo;s own plain background shows through instead.
                </p>
                <label className="dml-label">Background color</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="color" value={settings.trophyActionsBg || "#221946"}
                    onChange={(e) => setSettings({ ...settings, trophyActionsBg: e.target.value })}
                    style={{ width: 44, height: 36, padding: 2, border: "1px solid #c9cccf", borderRadius: 8, cursor: "pointer", flexShrink: 0 }}
                  />
                  <input
                    className="dml-input" type="text" maxLength={7} placeholder="#221946"
                    value={settings.trophyActionsBg}
                    onChange={(e) => setSettings({ ...settings, trophyActionsBg: e.target.value })}
                  />
                  {settings.trophyActionsBg && (
                    <button
                      type="button" className="dml-btn-ghost dml-btn-sm" style={{ flexShrink: 0 }}
                      onClick={() => setSettings({ ...settings, trophyActionsBg: "" })}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </section>

              <section className="dml-card dml-card-wide">
                <h2 className="dml-card-title">Images</h2>
                <p className="dml-card-hint">
                  Replace the trophy screen&rsquo;s art with your own. Leave blank to use the built-in default.
                </p>
                {uploadErr && <p className="dml-msg-err" style={{ marginBottom: 12 }}>{uploadErr}</p>}
                {imageGrid(TROPHY_IMAGE_FIELDS)}
              </section>

              <section className="dml-card dml-card-wide">
                <h2 className="dml-card-title">Trophy designs</h2>
                <p className="dml-card-hint">
                  Upload as many trophy illustrations as you like &mdash; one is picked at random each time a
                  player hits &ldquo;Generate Trophy&rdquo;, for variety. Leave empty to use the built-in default.
                </p>
                {uploadErr && <p className="dml-msg-err" style={{ marginBottom: 12 }}>{uploadErr}</p>}
                <div className="dml-image-grid">
                  {settings.trophyTopImages.map((url, i) => (
                    <div className="dml-image-tile" key={url + i}>
                      <div className="dml-image-thumb">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" />
                      </div>
                      <div className="dml-image-actions">
                        <button
                          type="button" className="dml-btn-ghost dml-btn-sm" style={{ flex: "1 1 100%" }}
                          onClick={() => removeTrophyTopImage(i)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="dml-image-tile">
                    <label className="dml-image-thumb dml-image-thumb-add">
                      {uploading === "trophyTopPool" ? "Uploading…" : "+ Add image"}
                      <input
                        type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }}
                        disabled={uploading !== null}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadTrophyTopImage(f); e.target.value = ""; }}
                      />
                    </label>
                    <div className="dml-image-actions">
                      <button
                        type="button" className="dml-btn-ghost dml-btn-sm" style={{ flex: "1 1 100%" }}
                        onClick={() => openPicker("trophyTopPool")}
                      >
                        Browse existing
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </main>

      {pickerFor && (
        <div className="dml-picker-backdrop" onClick={() => setPickerFor(null)}>
          <div className="dml-picker-card" onClick={(e) => e.stopPropagation()}>
            <div className="dml-picker-head">
              <span>Choose an existing image</span>
              <button type="button" className="dml-btn-ghost dml-btn-sm" onClick={() => setPickerFor(null)}>Close</button>
            </div>
            {libraryLoading && <p className="dml-empty">Loading your uploads…</p>}
            {libraryErr && <p className="dml-msg-err">{libraryErr}</p>}
            {!libraryLoading && !libraryErr && library && library.length === 0 && (
              <p className="dml-empty">No images uploaded yet — use Upload instead.</p>
            )}
            {!libraryLoading && library && library.length > 0 && (
              <div className="dml-picker-grid">
                {library.map((img) => (
                  <button
                    type="button" key={img.key} className="dml-picker-thumb"
                    onClick={() => selectFromLibrary(img.url)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt="" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
