"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

const POLL_MS = 30_000;
const SAFETY_POLL_MS = 5 * 60_000;
const DEBOUNCE_MS = 400;

/**
 * Live stock (MEDICINES-TAB.md §12): the private topic `pharmacy-stock:<hospital>` (0270) says a movement or a fridge
 * reading landed, and the page re-reads the server. The `use-board-live` pattern: pauses while hidden, re-reads on
 * focus, polls every 30 s while the channel is down. Returns whether the channel is up.
 */
export function useStockLive(hospitalId: string, enabled = true): boolean {
  const router = useRouter();
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let closed = false;
    let up = false;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;

    const refresh = () => {
      if (debounce) return;
      debounce = setTimeout(() => {
        debounce = null;
        router.refresh();
      }, DEBOUNCE_MS);
    };
    const schedule = () => {
      if (poll) clearInterval(poll);
      poll =
        document.visibilityState === "visible"
          ? setInterval(() => router.refresh(), up ? SAFETY_POLL_MS : POLL_MS)
          : null;
    };
    const onVisible = () => {
      schedule();
      if (document.visibilityState === "visible") refresh();
    };

    const supabase = createClient();
    const channel = supabase.channel(`pharmacy-stock:${hospitalId}`, { config: { private: true } });
    channel.on("broadcast", { event: "change" }, refresh);
    void supabase.realtime
      .setAuth()
      .catch(() => undefined)
      .then(() => {
        if (closed) return;
        channel.subscribe((status) => {
          if (closed) return;
          up = status === "SUBSCRIBED";
          setLive(up);
          schedule();
        });
      });

    schedule();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      closed = true;
      void supabase.removeChannel(channel);
      if (poll) clearInterval(poll);
      if (debounce) clearTimeout(debounce);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [hospitalId, enabled, router]);

  return live;
}
