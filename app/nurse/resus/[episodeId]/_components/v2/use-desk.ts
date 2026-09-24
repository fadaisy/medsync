"use client";

import type { SubmitSpec } from "./desk-queue-model";
import type { Delta } from "./desk-sync";
import type { DeskEpisode, DeskInitialData, DeskSnapshot, PendingEntry } from "./types";
import type { TimelineEvent } from "@/lib/resus/types";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { activeView } from "./desk-queue-model";
import { fetchDelta, useOnline, useServerOffset } from "./desk-sync";
import { fetchDeskSnapshotV2 } from "./snapshot-action";
import { unsavedSteps } from "./step-panel-draft";
import { useWriteQueue } from "./use-desk-queue";

export type { OptimisticRow, SubmitSpec } from "./desk-queue-model";
export { toOutcome } from "./desk-queue-model";

/**
 * Resus Desk v2 — the client store (GATE A §9, prompt §9).
 *
 *  - Logging never waits: a write renders at once as a pending row, then the
 *    queue (use-desk-queue.ts) sends it in order, retrying with backoff while
 *    online and pausing offline. The server is idempotent on clientEventId.
 *  - One truth on every device: a private realtime channel (resus:<episode>)
 *    says "something changed"; the client then fetches the delta with a scoped
 *    GET (/api/resus/<id>/delta — not a server action, so a read never queues
 *    behind a write). If the channel cannot subscribe, poll every 10 s.
 *  - Server-anchored clock: offset from the round-trip midpoint, refreshed every
 *    5 min; recordedAt = now + offset. Only leaf clocks tick (useNow).
 *
 * Offline persistence is in-memory only (E1): an unload guard warns while
 * anything is waiting or a step holds unsaved findings.
 */

/** The team + after-close records (re-read with the episode row; never stale). */
export type DeskTeam = Omit<DeskSnapshot, "episode">;

export interface DeskStore {
  episode: DeskEpisode;
  roster: DeskTeam["roster"];
  responders: DeskTeam["responders"];
  afterDeathTasks: DeskTeam["afterDeathTasks"];
  debrief: DeskTeam["debrief"];
  recorders: DeskTeam["recorders"];
  /** Confirmed rows — the full immutable store. */
  events: TimelineEvent[];
  /** Active view of confirmed ∪ pending rows (corrections applied; refused writes left out). */
  activeEvents: TimelineEvent[];
  pending: PendingEntry[];
  online: boolean;
  realtime: "connecting" | "live" | "polling";
  /** Server-corrected clock. */
  nowMs: () => number;
  /** |offset| > 30 s — the device clock is wrong (warn). */
  clockWarning: boolean;
  readOnly: boolean;
  /** The session lapsed (a delta or write said so); cleared by the next good answer. */
  signedOut: boolean;
  submit: (spec: SubmitSpec) => string;
  retry: (clientEventId: string) => void;
  /** False when the entry is being sent or already accepted: correct it instead. */
  discard: (clientEventId: string) => boolean;
  /** Fetch the delta; `full` also re-reads the episode row + team at once. */
  refresh: (opts?: { full?: boolean }) => Promise<void>;
}

const POLL_MS = 10_000;
const SAFETY_POLL_MS = 60_000;
const SNAPSHOT_DEBOUNCE_MS = 400;

/** A leaf ticking clock — use inside small components only. */
export function useNow(nowMs: () => number, intervalMs = 1000): number {
  const [t, setT] = useState(() => nowMs());
  useEffect(() => {
    const id = setInterval(() => setT(nowMs()), intervalMs);
    return () => clearInterval(id);
  }, [nowMs, intervalMs]);
  return t;
}

export function useDesk(initial: DeskInitialData): DeskStore {
  const episodeId = initial.episode.id;
  const [episode, setEpisode] = useState<DeskEpisode>(initial.episode);
  const [events, setEvents] = useState<TimelineEvent[]>(initial.events);
  const [team, setTeam] = useState<DeskTeam>(() => ({
    roster: initial.roster,
    responders: initial.responders,
    afterDeathTasks: initial.afterDeathTasks,
    debrief: initial.debrief,
    recorders: initial.recorders,
  }));
  const [signedOut, setSignedOut] = useState(false);
  const [realtime, setRealtime] = useState<DeskStore["realtime"]>("connecting");
  const online = useOnline();

  const eventsRef = useRef(events);
  /* ── Delta: rows written since the newest confirmed row ── */
  const lastCreatedIso = useCallback(() => {
    let max = "1970-01-01T00:00:00.000Z";
    for (const e of eventsRef.current) if (e.createdAt > max) max = e.createdAt;
    return max;
  }, []);
  const offsetMs = useServerOffset(episodeId, initial.serverTimeIso, lastCreatedIso);
  const offsetRef = useRef(offsetMs);
  // A closed episode writes after-close records with no timeline row: re-read the snapshot.
  const closedRef = useRef(episode.state !== "active");
  useLayoutEffect(() => {
    offsetRef.current = offsetMs;
    eventsRef.current = events;
    closedRef.current = episode.state !== "active";
  }, [offsetMs, events, episode.state]);
  const nowMs = useCallback(() => Date.now() + offsetRef.current, []);

  const refreshRef = useRef<(opts?: { since?: string }) => Promise<void>>(async () => undefined);
  const queue = useWriteQueue({
    episodeId,
    userId: initial.me.userId,
    nowMs,
    online,
    eventsRef,
    refreshRef,
    signedOut,
    setSignedOut,
  });
  const { settle, pending } = queue;
  const pendingRef = useRef(pending);
  useLayoutEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  /* ── Snapshot: the episode row + team, re-read when the record changes ── */
  const loadSnapshot = useCallback(async () => {
    const s = await fetchDeskSnapshotV2({ episodeId }).catch(() => null);
    if (!s) return;
    setEpisode(s.episode);
    setTeam({
      roster: s.roster,
      responders: s.responders,
      afterDeathTasks: s.afterDeathTasks,
      debrief: s.debrief,
      recorders: s.recorders,
    });
  }, [episodeId]);
  const snapshotTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleSnapshot = useCallback(() => {
    if (snapshotTimer.current) clearTimeout(snapshotTimer.current);
    snapshotTimer.current = setTimeout(() => {
      snapshotTimer.current = null;
      void loadSnapshot();
    }, SNAPSHOT_DEBOUNCE_MS);
  }, [loadSnapshot]);
  useEffect(
    () => () => {
      if (snapshotTimer.current) clearTimeout(snapshotTimer.current);
    },
    [],
  );

  const applyDelta = useCallback(
    (r: Extract<Delta, { ok: true }>, snap: boolean) => {
      if (r.events.length > 0) {
        if (snap) scheduleSnapshot();
        setEvents((prev) => {
          const seen = new Set(prev.map((e) => e.id));
          const add = r.events.filter((e) => !seen.has(e.id));
          return add.length ? [...prev, ...add] : prev;
        });
      }
      settle(r.events);
      setEpisode((prev) =>
        prev.state === r.header.state &&
        prev.phase === r.header.phase &&
        prev.currentArrestSeq === r.header.currentArrestSeq
          ? prev
          : {
              ...prev,
              state: r.header.state as DeskEpisode["state"],
              phase: r.header.phase,
              currentArrestSeq: r.header.currentArrestSeq,
            },
      );
    },
    [scheduleSnapshot, settle],
  );

  const refresh = useCallback(
    async (opts?: { full?: boolean; since?: string }) => {
      const r = await fetchDelta(episodeId, opts?.since ?? lastCreatedIso());
      if (r?.ok) {
        setSignedOut(false);
        applyDelta(r, opts?.full !== true);
      } else if (r?.signedOut) setSignedOut(true);
      // Read after the delta so the (fresher) episode row lands last.
      if (opts?.full === true) await loadSnapshot();
    },
    [episodeId, lastCreatedIso, loadSnapshot, applyDelta],
  );
  useLayoutEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  const deltaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleDelta = useCallback(() => {
    if (deltaTimer.current) return;
    deltaTimer.current = setTimeout(() => {
      deltaTimer.current = null;
      void refresh();
    }, 150);
  }, [refresh]);

  /* ── Realtime (private channel) with a polling fallback ── */
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let poll: ReturnType<typeof setInterval> | null = null;
    const startPolling = (ms: number) => {
      if (poll) clearInterval(poll);
      poll = setInterval(() => void refresh(closedRef.current ? { full: true } : undefined), ms);
    };
    startPolling(POLL_MS);
    const channel = supabase.channel(`resus:${episodeId}`, { config: { private: true } });
    channel.on("broadcast", { event: "*" }, () => {
      scheduleDelta();
      if (closedRef.current) scheduleSnapshot();
    });
    void supabase.realtime
      .setAuth()
      .catch(() => undefined)
      .then(() => {
        if (cancelled) return;
        channel.subscribe((status) => {
          if (cancelled) return;
          if (status === "SUBSCRIBED") {
            setRealtime("live");
            startPolling(SAFETY_POLL_MS);
            void refresh();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            setRealtime("polling");
            startPolling(POLL_MS);
          }
        });
      });
    const fallback = setTimeout(
      () => setRealtime((s) => (s === "connecting" ? "polling" : s)),
      5000,
    );
    return () => {
      cancelled = true;
      clearTimeout(fallback);
      if (poll) clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [episodeId, refresh, scheduleDelta, scheduleSnapshot]);

  /* ── Unload guard while anything is waiting or a step holds unsaved findings ── */
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (
        pendingRef.current.length === 0 &&
        unsavedSteps(episodeId, eventsRef.current).length === 0
      )
        return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [episodeId]);

  const activeEvents = useMemo(() => activeView(events, pending), [events, pending]);

  return {
    episode,
    ...team,
    events,
    activeEvents,
    pending,
    online,
    realtime,
    nowMs,
    clockWarning: Math.abs(offsetMs) > 30_000,
    readOnly: episode.state !== "active",
    signedOut,
    submit: queue.submit,
    retry: queue.retry,
    discard: queue.discard,
    refresh,
  };
}
