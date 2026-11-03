"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const POLL_MS = 30_000;

/**
 * Keeps the roster current while the tab is visible: a re-read every 30 s and on return to the tab, so on duty now,
 * sign-ins and a colleague's answer to a swap show without a reload.
 * ponytail: polling only; add a `pharmacy-roster:<hospital>` broadcast (as ward-beds) if 30 s proves too slow.
 */
export function useRosterLive(enabled: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    let poll: ReturnType<typeof setInterval> | null = null;
    const schedule = (reread = true) => {
      if (poll) clearInterval(poll);
      poll =
        document.visibilityState === "visible"
          ? setInterval(() => router.refresh(), POLL_MS)
          : null;
      if (reread && document.visibilityState === "visible") router.refresh();
    };
    const onVisible = () => schedule();
    schedule(false);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (poll) clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, router]);
}
