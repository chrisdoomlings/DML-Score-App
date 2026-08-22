"use client";

import type { ReactNode } from "react";

export function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="dml-stat">
      <div className="dml-stat-value">{value}</div>
      <div className="dml-stat-label">{label}</div>
    </div>
  );
}

export function CenteredMessage({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ fontSize: 15, color: "#6d7175" }}>{children}</p>
    </div>
  );
}

export function GlobalStyle() {
  return (
    <style>{`
      .dml-topbar { position: sticky; top: 0; z-index: 10; background: #fff; border-bottom: 1px solid #e1e3e5; }
      .dml-topbar-inner {
        max-width: 1120px; margin: 0 auto; padding: 18px 24px 0;
        display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
      }
      .dml-title { font-size: 20px; font-weight: 700; margin: 0; color: #202223; }
      .dml-subtitle { font-size: 13px; color: #6d7175; margin: 2px 0 0; }
      .dml-savebar { display: flex; align-items: center; gap: 12px; }
      .dml-msg-ok { font-size: 13px; color: #008060; font-weight: 600; }
      .dml-msg-err { font-size: 13px; color: #d72c0d; font-weight: 600; }
      .dml-msg-dirty { font-size: 13px; color: #8a6116; font-weight: 600; }

      .dml-nav { max-width: 1120px; margin: 0 auto; padding: 14px 24px 0; display: flex; gap: 4px; }
      .dml-nav-link {
        font-size: 13px; font-weight: 600; color: #6d7175; text-decoration: none;
        padding: 8px 4px; border-bottom: 2px solid transparent; margin-bottom: -1px;
      }
      .dml-nav-link:hover { color: #202223; }
      .dml-nav-link.active { color: #008060; border-bottom-color: #008060; }

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
      .dml-field-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 18px; }
      .dml-textarea {
        width: 100%; padding: 9px 11px; font-size: 13px; font-family: inherit; resize: vertical; min-height: 44px;
        border: 1px solid #c9cccf; border-radius: 8px; transition: border-color 0.15s, box-shadow 0.15s;
      }
      .dml-textarea:focus { outline: none; border-color: #008060; box-shadow: 0 0 0 3px rgba(0,128,96,0.12); }

      .dml-checkbox-row { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #202223; margin-top: 4px; }

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

      .dml-achv-list { display: flex; flex-direction: column; }
      .dml-achv-row {
        display: grid; grid-template-columns: 24px 72px 1fr; gap: 14px; align-items: start;
        padding: 16px 0; border-top: 1px solid #f1f2f3;
      }
      .dml-achv-row:first-child { border-top: 0; }
      .dml-achv-row > input[type="checkbox"] { margin-top: 11px; }
      .dml-achv-icon { width: 72px; display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; }
      .dml-achv-icon-thumb {
        width: 72px; height: 72px; border-radius: 8px; overflow: hidden;
        background: #f6f6f7; border: 1px solid #e1e3e5; display: flex; align-items: center; justify-content: center;
      }
      .dml-achv-icon-thumb img { width: 100%; height: 100%; object-fit: cover; }
      .dml-achv-icon-actions { display: flex; gap: 4px; }
      .dml-achv-fields { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
      .dml-achv-key { font-size: 11px; color: #8a8d91; font-family: monospace; }

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

      .dml-bar-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-top: 1px solid #f1f2f3; }
      .dml-bar-label { font-size: 13px; color: #202223; width: 130px; flex-shrink: 0; }
      .dml-bar-track { flex: 1; height: 8px; background: #f1f2f3; border-radius: 4px; overflow: hidden; }
      .dml-bar-fill { height: 100%; background: #008060; border-radius: 4px; }
      .dml-bar-value { font-size: 12px; color: #6d7175; width: 40px; text-align: right; flex-shrink: 0; }

      .dml-empty { font-size: 13px; color: #8a8d91; padding: 8px 0; }

      .dml-picker-backdrop {
        position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 100;
        display: flex; align-items: center; justify-content: center; padding: 24px;
      }
      .dml-picker-card {
        background: #fff; border-radius: 12px; padding: 20px; width: min(640px, 100%);
        max-height: 80vh; overflow-y: auto; box-shadow: 0 12px 40px rgba(0,0,0,0.2);
      }
      .dml-picker-head {
        display: flex; align-items: center; justify-content: space-between;
        font-size: 14px; font-weight: 700; color: #202223; margin-bottom: 14px;
      }
      .dml-picker-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 10px; }
      .dml-picker-thumb {
        aspect-ratio: 1; border-radius: 8px; overflow: hidden; padding: 0; cursor: pointer;
        background: #f6f6f7; border: 1px solid #e1e3e5; transition: border-color 0.15s;
      }
      .dml-picker-thumb:hover { border-color: #008060; }
      .dml-picker-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }

      /* Rough visual approximation of the storefront's .dmls-card (dark
         gradient panel, rounded, clips overflow) — not pixel-identical to
         the theme extension's real CSS/webfont, but enough to preview how
         width/font-size settings will look before saving. */
      .dml-preview-frame { margin-bottom: 20px; }
      .dml-preview-card {
        position: relative; overflow: hidden; border-radius: 22px;
        background-image: linear-gradient(180deg, #2a3182, #232b7a);
        background-size: cover; background-position: center;
        padding: 26px 20px 28px; text-align: center;
        max-width: 340px; margin: 0 auto;
        color: #fff; font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      }
      .dml-preview-logo { display: block; height: auto; max-width: 90%; margin: 0 auto 14px; }
      .dml-preview-characters { display: block; height: auto; width: calc(100% + 72px); max-width: none; margin: 0 -36px 10px; }
      .dml-preview-title { font-size: 32px; line-height: 1.15; font-weight: 700; margin: 6px auto; max-width: 100%; }
      .dml-preview-sub { font-size: 13px; line-height: 1.5; color: #b8bde4; max-width: 32ch; margin: 0 auto 14px; }
      .dml-preview-btn {
        display: inline-block; padding: 11px 24px; border-radius: 12px;
        background: #10153f; border: 1px solid rgba(255,255,255,0.14);
        color: #fff; font-weight: 700; font-size: 14px;
      }
      .dml-preview-caption { font-size: 11px; color: #8a8d91; text-align: center; margin: 8px 0 0; }

      .dml-trend { display: flex; align-items: stretch; gap: 10px; }
      .dml-trend-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; }
      .dml-trend-count { font-size: 11px; font-weight: 700; color: #6d7175; height: 14px; }
      .dml-trend-bararea { height: 64px; width: 100%; display: flex; align-items: flex-end; }
      .dml-trend-bar { width: 100%; max-width: 28px; margin: 0 auto; background: #008060; border-radius: 4px 4px 0 0; }
      .dml-trend-day { font-size: 11px; color: #8a8d91; }

      .dml-recent-list { display: flex; flex-direction: column; }
      .dml-recent-row {
        display: flex; align-items: center; justify-content: space-between; gap: 12px;
        padding: 10px 0; border-top: 1px solid #f1f2f3; font-size: 13px; color: #202223;
      }
      .dml-recent-row:first-child { border-top: 0; }
      .dml-recent-meta { color: #6d7175; margin-left: 8px; }
      .dml-recent-time { color: #8a8d91; font-size: 12px; white-space: nowrap; flex-shrink: 0; }

      @media (max-width: 700px) {
        .dml-field-row { grid-template-columns: 1fr; }
        .dml-milestone-head { display: none; }
        .dml-milestone-row { grid-template-columns: 24px 1fr; row-gap: 8px; }
        .dml-milestone-row input[type="number"] { grid-column: 2; width: 90px; }
        .dml-achv-row { grid-template-columns: 24px 1fr; row-gap: 10px; }
        .dml-achv-row > input[type="checkbox"] { grid-row: 1; }
        .dml-achv-icon { grid-column: 2; flex-direction: row; align-items: center; width: auto; }
        .dml-achv-fields { grid-column: 1 / -1; }
        .dml-bar-label { width: 90px; }
      }
    `}</style>
  );
}
