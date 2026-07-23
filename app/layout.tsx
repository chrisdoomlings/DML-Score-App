import type { ReactNode } from "react";
import "./globals.css";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <title>DML Score</title>
        <meta name="description" content="Doomlings score tool — admin" />
        <meta name="shopify-api-key" content={process.env.SHOPIFY_API_KEY ?? ""} />
        {/* Must be a literal, static <script> tag (not next/script) — App Bridge
            refuses to run if the tag has async/defer, which next/script's dynamic
            DOM insertion sets by default even under strategy="beforeInteractive". */}
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
      </head>
      <body>{children}</body>
    </html>
  );
}
