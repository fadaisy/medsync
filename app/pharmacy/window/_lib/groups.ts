import type { ReviewLane, ReviewQueueRow, ReviewStage } from "@/lib/pharmacy/queue";
import { computeReviewQueue } from "@/lib/pharmacy/queue";

/**
 * Window's pure projections (GATE A §3): the queue list grouped by stage, and the open lines grouped by what can be
 * done now. Both only sort and split what the engines already decided (Law 4); no rule is made here.
 */
export type QueueGroupKey = "first" | "to_review" | "queried" | "awaiting_cosign" | "ready";
const STAGE_ORDER: readonly ReviewStage[] = ["to_review", "queried", "awaiting_cosign", "ready"];

export interface QueueGroupsInput {
  lane: ReviewLane | "all";
  stage: ReviewStage | "all";
  serves: string | null;
  /** The lane rule is signed: only then does the review-first lane exist. */
  signed: boolean;
}

/**
 * The engine's filter and order (`computeReviewQueue`), oldest first (earlier days before today), then split: the
 * review-first lane on top (when the rule is signed and the lane filter allows it), then each stage.
 */
export function queueGroups<R extends ReviewQueueRow>(rows: readonly R[], f: QueueGroupsInput) {
  const q = computeReviewQueue(rows, f);
  const ordered = [...q.earlier, ...q.today];
  const first = (r: R) => f.signed && f.lane !== "standard" && r.lane === "pharmacist_first";
  const groups: { key: QueueGroupKey; rows: R[] }[] = [
    { key: "first", rows: ordered.filter(first) },
    ...STAGE_ORDER.map((s) => ({ key: s as QueueGroupKey, rows: ordered.filter((r) => !first(r) && r.stage === s) })),
  ];
  return { ...q, groups: groups.filter((g) => g.rows.length) };
}

export type OpenGroupKey = "shelf" | "patient" | "out";

/**
 * Open lines by what can be done now: owed and on the shelf here (`onShelfHere`, the shelf engine's answer), being
 * bought outside (waits on the patient), owed with nothing here. Order within a group is the read's (oldest first).
 */
export function openGroups<R extends { outcome: "owed" | "buying_outside"; onShelfHere: boolean }>(
  rows: readonly R[],
): { key: OpenGroupKey; rows: R[] }[] {
  const key = (r: R): OpenGroupKey =>
    r.outcome === "buying_outside" ? "patient" : r.onShelfHere ? "shelf" : "out";
  return (["shelf", "patient", "out"] as const).map((k) => ({ key: k, rows: rows.filter((r) => key(r) === k) }));
}

/** A query value that must be one of `allowed`, else the fallback. */
export function pick<T extends string>(v: string | string[] | undefined, allowed: readonly T[], fallback: T): T {
  const s = Array.isArray(v) ? v[0] : v;
  return allowed.includes(s as T) ? (s as T) : fallback;
}
