"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GlobalStyle } from "@/components/admin/AdminUI";

const TABS = [
  { href: "/app/dashboard", label: "Dashboard" },
  { href: "/app/analytics", label: "Analytics" },
  { href: "/app/settings", label: "Settings" },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div style={{ background: "#f4f5f7", minHeight: "100vh" }}>
      <GlobalStyle />
      <div className="dml-topbar">
        <div className="dml-topbar-inner">
          <div>
            <h1 className="dml-title">DML Score</h1>
            <p className="dml-subtitle">Points, milestones, art, and activity for the score tool.</p>
          </div>
        </div>
        <nav className="dml-nav">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={"dml-nav-link" + (pathname === tab.href ? " active" : "")}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}
