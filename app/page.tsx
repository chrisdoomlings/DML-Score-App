"use client";

import { useState } from "react";

export default function Landing() {
  const [shop, setShop] = useState("");

  function openApp(e: React.FormEvent) {
    e.preventDefault();
    const domain = shop.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!domain) return;
    const full = domain.includes(".") ? domain : `${domain}.myshopify.com`;
    window.location.href = `/auth?shop=${encodeURIComponent(full)}`;
  }

  return (
    <main style={{ maxWidth: 420, margin: "12vh auto", padding: 24 }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>DML Score</h1>
      <p style={{ color: "#6d7175", marginBottom: 24 }}>
        Doomlings score tool — sign in with your shop domain to open the dashboard.
      </p>
      <form onSubmit={openApp} style={{ display: "flex", gap: 8 }}>
        <input
          value={shop}
          onChange={(e) => setShop(e.target.value)}
          placeholder="your-store.myshopify.com"
          style={{
            flex: 1, padding: "10px 12px", fontSize: 15,
            border: "1px solid #c9cccf", borderRadius: 8,
          }}
        />
        <button
          type="submit"
          style={{
            padding: "10px 18px", fontSize: 15, fontWeight: 600, cursor: "pointer",
            background: "#008060", color: "#fff", border: 0, borderRadius: 8,
          }}
        >
          Open
        </button>
      </form>
    </main>
  );
}
