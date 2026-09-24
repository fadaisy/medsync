"use client";

import type { SubmitSpec } from "./desk-queue-model";
import type { PendingEntry, WriteOutcome } from "./types";
import type { TimelineEvent } from "@/lib/resus/types";
import type { RefObject } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  backoffMs,
  EPOCH,
  landedEntries,
  nextToSend,
  withTimeout,
  WRITE_TIMEOUT_MS,
} from "./desk-queue-model";

/**
 * Resus Desk v2 — the write queue (GATE A §9). In order, one at a time; a hung
 * request times out into a retry (the server is idempotent on clientEventId);
 * a retryable failure waits out its backoff (1-2-4-8-10 s) even when new taps
 * arrive; an accepted write stays until its rows reach the record, so it never
 * vanishes between the write and the delta. The queue's truth is a ref updated
 * synchronously, so flush and discard never act on a stale render.
 */

type Refresh = (opts?: { since?: string }) => Promise<void>;

/** About a minute at the 10 s backoff cap; then Retry/Discard show instead of a silent spin. */
const MAX_ATTEMPTS = 6;

export interface WriteQueue {
  pending: PendingEntry[];
  submit: (spec: SubmitSpec) => string;
  retry: (clientEventId: string) => void;
  /** False when the entry is on its way or already accepted — correct it instead. */
  discard: (clientEventId: string) => boolean;
  /** A delta arrived: drop every entry whose rows it (or the record) now holds. */
  settle: (delta: readonly TimelineEvent[]) => void;
}

export function useWriteQueue(opts: {
  episodeId: string;
  userId: string;
  nowMs: () => number;
  online: boolean;
  eventsRef: RefObject<TimelineEvent[]>;
  refreshRef: RefObject<Refresh>;
  /** The session lapsed (R2): writes keep retrying, uncapped, until it is back. */
  signedOut: boolean;
  setSignedOut: (v: boolean) => void;
}): WriteQueue {
  const { episodeId, userId, nowMs, online, eventsRef, refreshRef, signedOut, setSignedOut } = opts;
  const [pending, setPending] = useState<PendingEntry[]>([]);
  const queue = useRef<PendingEntry[]>([]);
  const update = useCallback((fn: (prev: PendingEntry[]) => PendingEntry[]) => {
    const next = fn(queue.current);
    if (next === queue.current) return;
    queue.current = next;
    setPending(next);
  }, []);
  const patch = useCallback(
    (id: string, p: Partial<PendingEntry>) =>
      update((prev) => prev.map((e) => (e.clientEventId === id ? { ...e, ...p } : e))),
    [update],
  );

  // Specs live outside React state (they hold closures); entries mirror them.
  const specs = useRef(new Map<string, SubmitSpec & { recordedAt: string }>());
  /** Accepted writes → the row ids the server returned, until the record holds them. */
  const awaiting = useRef(new Map<string, string[]>());
  const notBefore = useRef(new Map<string, number>());
  const inFlight = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const drop = useCallback(
    (ids: Iterable<string>) => {
      const gone = new Set(ids);
      if (gone.size === 0) return;
      for (const id of gone) {
        specs.current.delete(id);
        awaiting.current.delete(id);
        notBefore.current.delete(id);
      }
      update((prev) => {
        const next = prev.filter((p) => !gone.has(p.clientEventId));
        return next.length === prev.length ? prev : next;
      });
    },
    [update],
  );

  const settle = useCallback(
    (delta: readonly TimelineEvent[]) => {
      const known = new Set([...eventsRef.current, ...delta].map((e) => e.id));
      drop(landedEntries(delta, known, awaiting.current));
    },
    [drop, eventsRef],
  );

  /** Re-read until the accepted entry's rows land; a full re-read after the third miss. */
  const confirm = useCallback(
    async (id: string) => {
      for (let attempt = 0; ; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, backoffMs(attempt - 1)));
        if (!alive.current || !awaiting.current.has(id)) return;
        await refreshRef.current(attempt >= 3 ? { since: EPOCH } : undefined);
      }
    },
    [refreshRef],
  );

  const flushRef = useRef<() => Promise<void>>(async () => undefined);
  const wake = useCallback(() => queueMicrotask(() => void flushRef.current()), []);

  const flush = useCallback(async () => {
    if (inFlight.current || !navigator.onLine) return;
    const next = nextToSend(queue.current, notBefore.current, Date.now());
    if (!next) return;
    const id = next.clientEventId;
    const spec = specs.current.get(id);
    if (!spec) {
      drop([id]);
      wake();
      return;
    }
    inFlight.current = id;
    patch(id, { status: "sending" });
    let outcome: WriteOutcome;
    try {
      outcome = await withTimeout(
        spec.run({ clientEventId: id, recordedAt: spec.recordedAt }),
        WRITE_TIMEOUT_MS,
      );
    } catch {
      outcome = {
        ok: false,
        error: "No connection — the entry is kept and will retry.",
        retry: true,
      };
    }
    inFlight.current = null;
    if (!alive.current) return;
    const kept = queue.current.some((p) => p.clientEventId === id);
    if (outcome.ok) setSignedOut(false);
    else if (outcome.signedOut) setSignedOut(true);
    if (outcome.ok) {
      if (outcome.warnings?.length) spec.onWarnings?.(outcome.warnings);
      const ids = outcome.eventIds ?? [];
      const known = new Set(eventsRef.current.map((e) => e.id));
      if (kept && ids.length > 0 && !ids.every((x) => known.has(x))) {
        awaiting.current.set(id, ids);
        patch(id, { status: "sending", error: null });
        void confirm(id);
      } else {
        // No rows to wait for (e.g. "already in arrest"): let the record catch up first.
        if (kept && ids.length === 0) await refreshRef.current();
        drop([id]);
      }
    } else if (outcome.openDialog) {
      drop([id]);
      spec.onDialog?.(outcome.openDialog);
    } else if (kept) {
      const attempts = next.attempts + 1;
      const again = outcome.retry && (outcome.signedOut === true || attempts < MAX_ATTEMPTS);
      patch(id, { attempts, error: outcome.error, status: again ? "pending" : "failed" });
      if (again) {
        const wait = backoffMs(attempts - 1);
        notBefore.current.set(id, Date.now() + wait);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          timer.current = null;
          void flushRef.current();
        }, wait);
        return;
      }
    }
    wake();
  }, [confirm, drop, eventsRef, patch, refreshRef, setSignedOut, wake]);
  useLayoutEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  // Back online, or signed back in: skip any backoff and send now.
  useEffect(() => {
    if (!online || signedOut) return;
    notBefore.current.clear();
    void flushRef.current();
  }, [online, signedOut]);

  const submit = useCallback(
    (spec: SubmitSpec) => {
      const clientEventId = crypto.randomUUID();
      // Law 6: every write carries the server-anchored bedside time, set once here.
      const recordedAt = new Date(nowMs()).toISOString();
      specs.current.set(clientEventId, { ...spec, recordedAt });
      const optimistic: TimelineEvent[] = (
        spec.optimistic?.({ clientEventId, recordedAt }) ?? []
      ).map((row, i) => ({
        id: `pending:${clientEventId}:${i}`,
        episodeId,
        kind: row.kind,
        step: row.step,
        payload: row.payload,
        recordedByUserId: userId,
        recordedAt,
        createdAt: recordedAt,
        supersedesEventId: row.supersedesEventId ?? null,
        arrestSeq: row.arrestSeq ?? null,
        clientEventId,
        lateEntry: false,
      }));
      update((prev) => [
        ...prev,
        {
          clientEventId,
          label: spec.label,
          status: "pending",
          attempts: 0,
          error: null,
          optimistic,
          queuedAtMs: Date.now(),
        },
      ]);
      wake();
      return clientEventId;
    },
    [episodeId, userId, nowMs, update, wake],
  );

  const retry = useCallback(
    (id: string) => {
      notBefore.current.delete(id);
      update((prev) =>
        prev.map((p) =>
          p.clientEventId === id && p.status !== "sending"
            ? { ...p, status: "pending", error: null }
            : p,
        ),
      );
      wake();
    },
    [update, wake],
  );

  const discard = useCallback(
    (id: string) => {
      if (inFlight.current === id || awaiting.current.has(id)) return false;
      if (!queue.current.some((p) => p.clientEventId === id)) return false;
      drop([id]);
      return true;
    },
    [drop],
  );

  return { pending, submit, retry, discard, settle };
}
