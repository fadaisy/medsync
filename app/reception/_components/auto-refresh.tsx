"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

/**
 * A board that refreshes itself, and says so honestly: `router.refresh()`
 * every `everyMs`, and a live "Updated Ns ago" that counts from the moment
 * the refreshed page actually landed — the transition settling — not from
 * the tick that asked for it. Paused while the tab is hidden, so a desk with
 * twelve tabs open is not twelve pollers.
 */
export function AutoRefresh({ everyMs = 30_000 }: { everyMs?: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [refreshedAt, setRefreshedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const wasPending = useRef(false);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1_000);
    const poll = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      startTransition(() => router.refresh());
    }, everyMs);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(poll);
    };
  }, [router, everyMs]);

  // The refresh has landed when the transition goes from pending to settled.
  useEffect(() => {
    if (wasPending.current && !pending) setRefreshedAt(Date.now());
    wasPending.current = pending;
  }, [pending]);

  const seconds = Math.max(0, Math.round((now - refreshedAt) / 1000));
  // Not a live region: a counter that changes every second would be read
  // aloud every second. The refresh cadence is the useful sentence.
  return (
    <span className="text-muted-foreground text-caption font-mono tabular-nums">
      <span aria-hidden>{pending ? "Updating…" : `Updated ${seconds}s ago`} · </span>
      refreshes every {Math.round(everyMs / 1000)}s
    </span>
  );
}
