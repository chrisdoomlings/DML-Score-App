"use client";

declare global {
  interface Window {
    shopify?: { idToken: () => Promise<string> };
  }
}

async function waitForAppBridge(timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!window.shopify?.idToken) {
    if (Date.now() - start > timeoutMs) throw new Error("App Bridge did not initialize");
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** Fetch wrapper that attaches a fresh App Bridge session token on every call. */
export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  await waitForAppBridge();
  const token = await window.shopify!.idToken(); // ~1 min lifetime — always fetch fresh
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
