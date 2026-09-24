"use client";

import type { fetchResusDeltaV2 } from "@/app/nurse/resus/_v2/actions-survey";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/*
 * Resus Desk v2 — the store's I/O helpers (use-desk.ts runs them): online
 * state, the delta read and the server-anchored clock.
 */

const CLOCK_REFRESH_MS = 5 * 60_000;

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export const useOnline = (): boolean =>
  useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );

export type Delta = Awaited<ReturnType<typeof fetchResusDeltaV2>>;

/**
 * The scoped delta read (R5) — a plain GET, so it never queues behind a
 * server-action write. Null when the network or the route fails.
 */
export async function fetchDelta(episodeId: string, sinceIso: string): Promise<Delta | null> {
  try {
    const res = await fetch(`/api/resus/${episodeId}/delta?since=${encodeURIComponent(sinceIso)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok ? ((await res.json()) as Delta) : null;
  } catch {
    return null;
  }
}

/** Server clock offset: round-trip midpoint of the delta read, every 5 min. */
export function useServerOffset(
  episodeId: string,
  initialServerTimeIso: string,
  sinceIso: () => string,
): number {
  const [offsetMs, setOffsetMs] = useState(() => Date.parse(initialServerTimeIso) - Date.now());
  const bestRttMs = useRef(Number.POSITIVE_INFINITY);
  useEffect(() => {
    const sync = async () => {
      const t0 = Date.now();
      const r = await fetchDelta(episodeId, sinceIso());
      const t1 = Date.now();
      // A slow sample is off by half its wait: keep only those near the best round trip seen.
      if (!r?.ok || t1 - t0 > Math.max(2000, bestRttMs.current * 2)) return;
      bestRttMs.current = Math.min(bestRttMs.current, t1 - t0);
      setOffsetMs(Date.parse(r.serverTime) - (t0 + t1) / 2);
    };
    void sync();
    const id = setInterval(() => void sync(), CLOCK_REFRESH_MS);
    return () => clearInterval(id);
  }, [episodeId, sinceIso]);
  return offsetMs;
}
