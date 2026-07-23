import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "DML Score",
  description: "Doomlings score tool — admin",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
