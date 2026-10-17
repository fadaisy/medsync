"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { StatusWord } from "@/components/emr/status-word";
import { LAB2 } from "@/content/lab-phase-2";
import { announce } from "@/lib/lab/one-menu";
import { createClient } from "@/lib/supabase/client";

const POLL_MS = 15_000; // LV-3
const DEBOUNCE_MS = 300;

/**
 * The live worklist (Lab Phase 2 §5.5, LV-1..LV-4; E-LAB2-04). Listens on the hospital's private lab topic
 * `lab:<hospital>` (0109: only that hospital's lab staff may receive), whose messages carry ids and event
 * names only, and re-reads the page. If the channel is down it says so in amber and polls every 15 s while
 * the tab is visible. New specimens are announced once per 10 s, politely, as a count. No sound.
 */
export function LabLive({ hospitalId }: { hospitalId: string }) {
  const router = useRouter();
  const [up, setUp] = useState<boolean | null>(null);
  const [said, setSaid] = useState("");
  const pending = useRef({ lastAt: null as number | null, pending: 0 });

  useEffect(() => {
    let closed = false;
    let live = false;
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
        !live && document.visibilityState === "visible"
          ? setInterval(() => router.refresh(), POLL_MS)
          : null;
    };
    const supabase = createClient();
    const channel = supabase.channel(`lab:${hospitalId}`, { config: { private: true } });
    channel.on("broadcast", { event: "change" }, (m) => {
      if ((m.payload as { event?: string })?.event === "collected") {
        pending.current = { ...pending.current, pending: pending.current.pending + 1 };
        const a = announce(pending.current, Date.now());
        pending.current = a.state;
        if (a.say)
          setSaid(`${a.say} new ${a.say === 1 ? "specimen" : "specimens"} on the worklist.`);
      }
      refresh();
    });
    void supabase.realtime
      .setAuth()
      .catch(() => undefined)
      .then(() => {
        if (closed) return;
        channel.subscribe((status) => {
          if (closed) return;
          live = status === "SUBSCRIBED";
          setUp(live);
          schedule();
        });
      });
    schedule();
    const onVisible = () => schedule();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      closed = true;
      void supabase.removeChannel(channel);
      if (poll) clearInterval(poll);
      if (debounce) clearTimeout(debounce);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [hospitalId, router]);

  return (
    <>
      {up === false ? (
        <StatusWord tone="caution">{LAB2.live.paused}</StatusWord>
      ) : up ? (
        <span className="text-caption text-muted-foreground">{LAB2.live.on}</span>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {said}
      </p>
    </>
  );
}
