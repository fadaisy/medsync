"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

/** Without the channel, re-read every 15 s while the tab is visible (as the workspace board). */
const POLL_MS = 15_000;
/** With the channel up, a slow safety re-read in case a message was missed. */
const SAFETY_POLL_MS = 5 * 60_000;
const DEBOUNCE_MS = 400;

/**
 * Live bed board (ADR 0194 §6): the private topic `ward-beds:<hospital>` says "something on a ward
 * changed" and carries no patient data; a message re-reads the server. The repo's realtime pattern
 * (useWorkspaceLive): pauses while hidden, re-reads on focus, polls when the channel is down. Returns
 * whether the channel is up.
 */
export function useBedBoardLive(hospitalId: string, wardId: string, enabled = true): boolean {
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
    const channel = supabase.channel(`ward-beds:${hospitalId}`, { config: { private: true } });
    channel.on("broadcast", { event: "change" }, (msg) => {
      // Only this ward's changes re-read the page; the payload is { kind, ward_id, at }.
      const ward = (msg.payload as { ward_id?: string } | undefined)?.ward_id;
      if (!ward || ward === wardId) refresh();
    });
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
  }, [hospitalId, wardId, enabled, router]);

  return live;
}
