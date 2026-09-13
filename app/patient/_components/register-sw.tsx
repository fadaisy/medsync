"use client";

import { useEffect } from "react";

/**
 * Registers `public/sw.js` — the offline shell and nothing more (ADR 0088):
 * a static `/offline` page served only when a navigation fails, everything
 * else straight to the network, no API response ever cached.
 *
 * Renders nothing. Registration is a one-shot side effect with no React
 * state behind it, which is the one thing an effect is for.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      /* an insecure context or a blocked worker: the app works without it */
    });
  }, []);
  return null;
}
