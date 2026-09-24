"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { subscribeResusBoard } from "@/lib/resus/board-channel";
import { formatIdle } from "@/lib/resus/closeout/idle";

/**
 * Resus board v2 — the live parts: leaf clocks (server-anchored, each ticks on
 * its own) and the private realtime subscription (resus-board:<hospital>,
 * PHI-free payloads) that re-reads the server on change.
 */

const POLL_MS = 30_000;
const SAFETY_POLL_MS = 5 * 60_000;

/** mm:ss, or h:mm:ss past an hour. */
function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** A leaf clock: server-anchored, ticks on its own — the board never re-renders per second. */
export function Since({
  iso,
  serverNowIso,
  seconds,
}: {
  iso: string;
  serverNowIso: string;
  seconds?: boolean;
}) {
  const [now, setNow] = useState(() => Date.parse(serverNowIso));
  useEffect(() => {
    const offset = Date.parse(serverNowIso) - Date.now();
    const id = setInterval(() => setNow(Date.now() + offset), seconds ? 1000 : 30_000);
    return () => clearInterval(id);
  }, [serverNowIso, seconds]);
  const ms = now - Date.parse(iso);
  return <span className="font-mono tabular-nums">{seconds ? clock(ms) : formatIdle(ms)}</span>;
}

/** Private realtime topic → router.refresh(); a 30 s re-read while the channel is down. */
export function useLiveBoard(hospitalId: string): boolean {
  const router = useRouter();
  const [live, setLive] = useState(false);
  useEffect(() => {
    let poll = setInterval(() => router.refresh(), POLL_MS);
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const repoll = (ms: number) => {
      clearInterval(poll);
      poll = setInterval(() => router.refresh(), ms);
    };
    // Shared with the arrest alarm: one channel per topic (lib/resus/board-channel.ts).
    const unsubscribe = subscribeResusBoard(hospitalId, {
      onEpisode: () => {
        if (debounce) return;
        debounce = setTimeout(() => {
          debounce = null;
          router.refresh();
        }, 400);
      },
      onStatus: (up) => {
        setLive(up);
        repoll(up ? SAFETY_POLL_MS : POLL_MS);
      },
    });
    return () => {
      unsubscribe();
      clearInterval(poll);
      if (debounce) clearTimeout(debounce);
    };
  }, [hospitalId, router]);
  return live;
}
