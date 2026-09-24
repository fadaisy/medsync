"use client";

import type { DeskEpisode } from "./types";
import type { TimelineEvent } from "@/lib/resus/types";

import { formatIdle } from "@/lib/resus/closeout/idle";
import { deathObservation } from "@/lib/resus/death/confirmation";
import { useDeskCtx } from "./desk-context";
import { useNow } from "./use-desk";

/** "4:07" under an hour, "1:02:13" after (never negative). */
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(s % 60)}` : `${m}:${p(s % 60)}`;
}

/**
 * A leaf clock (UI-BUILD-SPEC §8): ticks itself once a second from the
 * server-anchored clock. The ticking digits are hidden from assistive tech (no
 * per-second chatter); a visually-hidden label carries the meaning, updated to
 * the minute. Server and client render different "now"s, so both spans opt out
 * of the hydration text check.
 */
export function ModeClock({ sinceIso, label }: { sinceIso: string; label: string }) {
  const { store } = useDeskCtx();
  const now = useNow(store.nowMs, 1000);
  const ms = now - Date.parse(sinceIso);
  return (
    <span className="font-mono tabular-nums">
      <span aria-hidden suppressHydrationWarning>
        {formatClock(ms)}
      </span>
      <span className="sr-only" suppressHydrationWarning>
        {`${label}: ${formatIdle(ms)}`}
      </span>
    </span>
  );
}

/* ─── Mode (UI-BUILD-SPEC §6) — shared by the desk body and the header ─── */

export type DeskMode =
  | "closed"
  /** Resuscitation stopped / CPR not attempted: the 5-minute observation runs. */
  | "confirm_death"
  /** Death confirmed, episode not yet ended (close-out with outcome Died). */
  | "death_confirmed"
  | "arrest"
  | "post_rosc"
  | "boarding"
  | "survey";

/**
 * Which surface the desk shows. Events win over the stored phase so an
 * optimistic Arrest / ROSC switches the page at once (the phase follows on
 * the next delta).
 */
export function deskMode(
  events: readonly TimelineEvent[],
  episode: Pick<DeskEpisode, "state" | "phase">,
  inArrest: boolean,
): DeskMode {
  if (episode.state !== "active") return "closed";
  const obs = deathObservation(events, 0);
  if (obs.startedAtMs !== null && !obs.invalidated) {
    const start = obs.startedAtMs;
    return events.some((e) => e.kind === "death_confirmed" && Date.parse(e.recordedAt) >= start)
      ? "death_confirmed"
      : "confirm_death";
  }
  if (inArrest) return "arrest";
  if (episode.phase === "boarding") return "boarding";
  if (
    episode.phase === "post_rosc" ||
    (episode.phase === "arrest" && events.some((e) => e.kind === "rosc"))
  )
    return "post_rosc";
  return "survey";
}
