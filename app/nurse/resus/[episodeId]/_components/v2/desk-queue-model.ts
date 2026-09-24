import type { FastPathDialog, PendingEntry, WriteOutcome } from "./types";
import type { TimelineEvent } from "@/lib/resus/types";

import { reconstructTimeline } from "@/lib/resus/timeline";

/*
 * Resus Desk v2 — the write queue's pure parts (use-desk-queue.ts runs them):
 * the submit contract, outcome adapter, timeout, ordering, and which rows
 * decision support may read.
 */

export interface SubmitSpec {
  label: string;
  /** Provisional rows to render at once (without ids/episode — the store fills them). */
  optimistic?: (ctx: { clientEventId: string; recordedAt: string }) => OptimisticRow[];
  /** `recordedAt` is the server-anchored bedside time (Law 6): pass it to the action. */
  run: (ctx: { clientEventId: string; recordedAt: string }) => Promise<WriteOutcome>;
  /** Called when the server asks for the prescribe dialog (fast path blocked). */
  onDialog?: (d: FastPathDialog) => void;
  /** Called with the non-blocking safety warnings a recorded write returned. */
  onWarnings?: (warnings: string[]) => void;
}

export type OptimisticRow = Pick<TimelineEvent, "kind" | "step" | "payload"> &
  Partial<Pick<TimelineEvent, "arrestSeq" | "supersedesEventId">>;

const MAX_BACKOFF_MS = 10_000;
export const WRITE_TIMEOUT_MS = 15_000;
export const EPOCH = "1970-01-01T00:00:00.000Z";
const TIMED_OUT = "No response — the entry is kept and will retry.";

export const backoffMs = (attempt: number): number => Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt);

/** Adapt a server-action result to a WriteOutcome. */
export function toOutcome(r: unknown): WriteOutcome {
  const res = r as {
    ok?: boolean;
    error?: string;
    openDialog?: boolean;
    drugId?: string;
    doseMg?: number | null;
    reasons?: string[];
    warnings?: string[];
    eventIds?: string[];
    signedOut?: boolean;
  } | null;
  if (res?.ok)
    return {
      ok: true,
      ...(res.warnings?.length ? { warnings: res.warnings } : {}),
      ...(res.eventIds ? { eventIds: res.eventIds } : {}),
    };
  if (res?.openDialog) {
    const recCode =
      res.drugId === "amiodarone_arrest_iv"
        ? "als_amiodarone"
        : res.drugId === "lidocaine_arrest_iv"
          ? "als_lidocaine"
          : "als_adrenaline";
    return {
      ok: false,
      error: "",
      retry: false,
      openDialog: {
        drugId: res.drugId ?? "",
        recCode,
        doseMg: res.doseMg ?? null,
        reasons: res.reasons ?? [],
      },
    };
  }
  const error = res?.error ?? "Could not record.";
  return {
    ok: false,
    error,
    retry: /will retry/i.test(error),
    ...(res?.signedOut ? { signedOut: true } : {}),
  };
}

/** A write that never answers becomes a retry instead of holding the queue. */
export function withTimeout(run: Promise<WriteOutcome>, ms: number): Promise<WriteOutcome> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<WriteOutcome>((resolve) => {
    t = setTimeout(() => resolve({ ok: false, error: TIMED_OUT, retry: true }), ms);
  });
  return Promise.race([run, timeout]).finally(() => clearTimeout(t));
}

/** The next entry to send, in order; null while the head waits out its backoff. */
export function nextToSend(
  pending: readonly PendingEntry[],
  notBefore: ReadonlyMap<string, number>,
  nowMs: number,
): PendingEntry | null {
  const head = pending.find((p) => p.status === "pending");
  if (!head) return null;
  return (notBefore.get(head.clientEventId) ?? 0) > nowMs ? null : head;
}

/**
 * What decision support may read: confirmed rows plus entries still on their
 * way — never one the server refused (it stays in the record as "Not saved").
 * A pending correction of a pending row (`pending:<cid>:<i>`) is pointed at
 * the landed row once it arrives, so the corrected row stays superseded.
 */
export function activeView(
  events: readonly TimelineEvent[],
  pending: readonly PendingEntry[],
): TimelineEvent[] {
  const landed = new Map<string, string[]>();
  for (const e of events)
    if (e.clientEventId)
      landed.set(e.clientEventId, [...(landed.get(e.clientEventId) ?? []), e.id]);
  const opt = pending
    .filter((p) => p.status !== "failed")
    .flatMap((p) => p.optimistic)
    .map((r) => {
      const m = r.supersedesEventId?.match(/^pending:(.+):(\d+)$/);
      const id = m ? landed.get(m[1]!)?.[Number(m[2])] : undefined;
      return id ? { ...r, supersedesEventId: id } : r;
    });
  return reconstructTimeline([...events, ...opt]);
}

/** Entries a delta confirms: by client id, or by every row id the server returned. */
export function landedEntries(
  delta: readonly TimelineEvent[],
  known: ReadonlySet<string>,
  awaiting: ReadonlyMap<string, readonly string[]>,
): Set<string> {
  const out = new Set<string>();
  for (const e of delta) if (e.clientEventId) out.add(e.clientEventId);
  for (const [id, ids] of awaiting) if (ids.every((x) => known.has(x))) out.add(id);
  return out;
}
