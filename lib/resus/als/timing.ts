import type { ArrestState, CycleStatus } from "@/lib/resus/model";
import type { TimelineEvent } from "@/lib/resus/types";

import { CYCLE_MS, CYCLE_OVERDUE_MS, CYCLE_PREPARE_MS } from "@/lib/resus/reference/als-catalog";

/**
 * ALS engine — arrest slicing, status, CPR durations and the 2-minute cycle. PURE.
 *
 * Catalog: docs/clinical/resus-als-clinical-catalog.md — ALS-REC-04 (declaration stamps the
 * arrest and CPR start), ALS-CPR-03 (2-min cycle), ALS-CPR-12 (prepare +1:45, overdue after
 * +2:15), ALS-SHK-02 (per-arrest counting), ALS-ROSC-04/05 (arrest sequence).
 *
 * An arrest is identified by its sequence number. `arrest_detected` without a sequence
 * (legacy v1) counts as arrest 1. Any other event belongs to an arrest through its
 * `arrestSeq` (column or payload); without one it is attributed by time to the arrest
 * whose declaration most recently precedes it.
 */

export const tMs = (e: TimelineEvent): number => Date.parse(e.recordedAt);

/** The arrest sequence an event carries (column first, then payload), or null. */
export function seqOf(e: TimelineEvent): number | null {
  if (typeof e.arrestSeq === "number") return e.arrestSeq;
  const p = e.payload.arrestSeq;
  return typeof p === "number" ? p : null;
}

/** The sequence of an `arrest_detected` event (legacy events count as arrest 1). */
export const declSeq = (e: TimelineEvent): number => seqOf(e) ?? 1;

/** The highest arrest sequence declared in the timeline; 0 when none. */
export function currentArrestSeq(tl: readonly TimelineEvent[]): number {
  let max = 0;
  for (const e of tl) if (e.kind === "arrest_detected") max = Math.max(max, declSeq(e));
  return max;
}

export interface ArrestSlice {
  seq: number;
  /** First declaration of this arrest (ALS-REC-04). */
  arrestAtMs: number;
  /** First `cpr_started` of this arrest, else the arrest time (ALS-REC-04). */
  cprStartMs: number;
  /** Start of the next arrest's window, or Infinity for the latest arrest. */
  windowEndMs: number;
  /** This arrest's events, time-ordered. */
  events: TimelineEvent[];
}

/** The events of arrest `seq` (the timeline must be time-ordered), or null if undeclared. */
export function arrestSlice(tl: readonly TimelineEvent[], seq: number): ArrestSlice | null {
  let arrestAtMs: number | null = null;
  let windowEndMs = Infinity;
  for (const e of tl) {
    if (e.kind !== "arrest_detected") continue;
    const s = declSeq(e);
    if (s === seq && arrestAtMs === null) arrestAtMs = tMs(e);
    if (s > seq) windowEndMs = Math.min(windowEndMs, tMs(e));
  }
  if (arrestAtMs === null) return null;
  const start = arrestAtMs;
  const events = tl.filter((e) => {
    if (e.kind === "arrest_detected") return declSeq(e) === seq;
    const s = seqOf(e);
    if (s !== null) return s === seq;
    const t = tMs(e);
    return t >= start && t < windowEndMs;
  });
  const cpr = events.find((e) => e.kind === "cpr_started");
  return { seq, arrestAtMs, cprStartMs: cpr ? tMs(cpr) : arrestAtMs, windowEndMs, events };
}

const MARK_KINDS = new Set(["arrest_detected", "rosc", "resuscitation_stopped"]);

/** The latest arrest / ROSC / stop mark decides the status of this arrest. */
export function arrestStatus(slice: ArrestSlice): Exclude<ArrestState["status"], "none"> {
  const marks = slice.events.filter((e) => MARK_KINDS.has(e.kind));
  const last = marks[marks.length - 1];
  if (!last || last.kind === "arrest_detected") return "in_arrest";
  return last.kind === "rosc" ? "rosc" : "stopped";
}

export interface Segment {
  startMs: number;
  /** Null while the segment is still running (in arrest now). */
  endMs: number | null;
}

/**
 * In-arrest intervals: CPR start → ROSC/stop, then each re-arrest → the next ROSC/stop or
 * now (ALS-ROSC-04: intermittent ROSC keeps one arrest, so CPR time accumulates).
 */
export function inArrestSegments(slice: ArrestSlice): Segment[] {
  const segs: Segment[] = [];
  let open: number | null = null;
  let first = true;
  for (const e of slice.events) {
    if (!MARK_KINDS.has(e.kind)) continue;
    if (e.kind === "arrest_detected") {
      if (open === null) open = first ? slice.cprStartMs : tMs(e);
      first = false;
    } else if (open !== null) {
      segs.push({ startMs: open, endMs: tMs(e) });
      open = null;
    }
  }
  if (open !== null) segs.push({ startMs: open, endMs: null });
  return segs;
}

/** Total CPR time over the segments (a running segment counts to now). */
export function cprElapsedMs(segs: readonly Segment[], nowMs: number): number {
  return segs.reduce((sum, s) => sum + Math.max(0, (s.endMs ?? nowMs) - s.startMs), 0);
}

/** Classify time since the cycle started (ALS-CPR-03 / ALS-CPR-12). */
export function cycleStatusAt(elapsedMs: number): CycleStatus {
  if (elapsedMs < CYCLE_PREPARE_MS) return "running";
  if (elapsedMs < CYCLE_MS) return "prepare";
  if (elapsedMs <= CYCLE_OVERDUE_MS) return "due";
  return "overdue";
}

/**
 * The cycle anchor of the running segment: the segment start (CPR start or re-arrest, or a
 * later `cpr_started`), restarted by each rhythm check and by a shock after that check
 * (ALS-CPR-03: single shock, then 2 min CPR).
 */
export function cycleAnchorMs(slice: ArrestSlice, seg: Segment): number {
  let anchor = seg.startMs;
  for (const e of slice.events) {
    const t = tMs(e);
    if (t < seg.startMs) continue;
    if (e.kind === "rhythm_check" || e.kind === "shock" || e.kind === "cpr_started") {
      anchor = Math.max(anchor, t);
    }
  }
  return anchor;
}

/** The cycle block of ArrestState. After ROSC / stop the timer is idle (null times). */
export function cycleState(
  slice: ArrestSlice,
  segs: readonly Segment[],
  nowMs: number,
): ArrestState["cycle"] {
  const number = 1 + slice.events.filter((e) => e.kind === "rhythm_check").length;
  const running = segs[segs.length - 1];
  if (!running || running.endMs !== null) {
    return { number, startedAtMs: null, dueAtMs: null, status: "running" };
  }
  const startedAtMs = cycleAnchorMs(slice, running);
  return {
    number,
    startedAtMs,
    dueAtMs: startedAtMs + CYCLE_MS,
    status: cycleStatusAt(nowMs - startedAtMs),
  };
}
