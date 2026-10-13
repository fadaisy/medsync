/**
 * The patient look-back after a rejected QC run or an unacceptable EQA result (Lab Phase 3 §6.6 LB-1..LB-4,
 * EA-4; GATE A §5.3; D-LAB3-08). Pure.
 *
 * The bias is an **estimate**: it only sorts the list. Nothing here changes a result; each result is decided by a
 * person (stands, repeat, amend), and the nonconformity cannot close until all are.
 */
import type { RuleBreak } from "@/lib/lab/qc-rules";
import type { RangeBand } from "@/lib/lab/ranges";

import { computeFlag } from "@/lib/lab/flags";

/** A released result that may fall in the window (downtime results carry their form time as `releasedAt`). */
export interface ReleasedResult {
  hospitalId: string;
  deviceId: string | null;
  conceptId: string;
  reportId: string;
  observationId: string;
  patientUserId: string;
  releasedAt: Date;
  value: string;
  /** Released past a QC hold (QH-4): always in the look-back. */
  override: boolean;
}

/**
 * LB-1: results of the component released on the device from the last accepted run before the rejected run to
 * the rejected run (overrides after it are always included). With no earlier accepted run, everything before it.
 */
export function lookBack(input: {
  hospitalId: string;
  deviceId: string;
  conceptId: string;
  runs: readonly { id: string; runAt: Date; decision: "accepted" | "warning" | "rejected" }[];
  rejectedRunId: string;
  results: readonly ReleasedResult[];
}): ReleasedResult[] {
  const rejected = input.runs.find((r) => r.id === input.rejectedRunId);
  if (!rejected) return [];
  const from = input.runs
    .filter((r) => r.decision !== "rejected" && r.runAt < rejected.runAt)
    .sort((a, b) => b.runAt.getTime() - a.runAt.getTime())[0]?.runAt;
  return input.results.filter(
    (r) =>
      r.hospitalId === input.hospitalId &&
      r.deviceId === input.deviceId &&
      r.conceptId === input.conceptId &&
      (r.override || ((!from || r.releasedAt > from) && r.releasedAt <= rejected.runAt)),
  );
}

/** EA-4: the look-back over an EQA round, receipt to scoring (no device: every in-house result). */
export const eqaLookBack = (input: {
  hospitalId: string;
  conceptId: string;
  from: Date;
  to: Date;
  results: readonly ReleasedResult[];
}) =>
  input.results.filter(
    (r) =>
      r.hospitalId === input.hospitalId &&
      r.conceptId === input.conceptId &&
      r.releasedAt >= input.from &&
      r.releasedAt <= input.to,
  );

export interface BiasEstimate {
  label: "estimate";
  /** In the component's unit. */
  value: number;
  level: number;
}

/**
 * LB-2: mean z of the failed level's breaking points × that level's SD, labelled estimate. With more than one
 * failed level, the larger estimate (it only sorts). Null when no reject break names a level with an SD.
 */
export function biasEstimate(
  breaks: readonly RuleBreak[],
  sdByLevel: ReadonlyMap<number, number>,
): BiasEstimate | null {
  const byLevel = new Map<number, number[]>();
  for (const b of breaks)
    if (b.kind === "reject")
      for (const p of b.points) byLevel.set(p.level, [...(byLevel.get(p.level) ?? []), p.z]);
  let best: BiasEstimate | null = null;
  for (const [level, zs] of byLevel) {
    const sd = sdByLevel.get(level);
    if (sd === undefined) continue;
    const value = (zs.reduce((s, z) => s + z, 0) / zs.length) * sd;
    if (!best || Math.abs(value) > Math.abs(best.value)) best = { label: "estimate", value, level };
  }
  return best;
}

export type LookBackSort = "flag_might_change" | "critical_nearby" | "unchanged";
const ORDER: LookBackSort[] = ["flag_might_change", "critical_nearby", "unchanged"];

/**
 * LB-2: `flag_might_change` if removing the bias moves the result across a signed range limit;
 * `critical_nearby` if it crosses or comes within the bias of a signed critical limit; else `unchanged`.
 * Sorted in that order, then by release time. Decides nothing.
 */
export function sortLookBack<T extends { value: string; releasedAt: Date }>(
  results: readonly T[],
  bias: BiasEstimate | null,
  limits: { band: Pick<RangeBand, "low" | "high"> | null; critical: (string | null)[] },
): (T & { sort: LookBackSort })[] {
  const sortOf = (r: T): LookBackSort => {
    const v = Number(r.value);
    if (!bias || !Number.isFinite(v)) return "unchanged";
    const without = (v - bias.value).toFixed(9);
    if (computeFlag(r.value, limits.band) !== computeFlag(without, limits.band))
      return "flag_might_change";
    const near = limits.critical.some(
      (l) => l !== null && Math.abs(v - Number(l)) <= Math.abs(bias.value) + 1e-9,
    );
    return near ? "critical_nearby" : "unchanged";
  };
  return results
    .map((r) => ({ ...r, sort: sortOf(r) }))
    .sort(
      (a, b) =>
        ORDER.indexOf(a.sort) - ORDER.indexOf(b.sort) ||
        a.releasedAt.getTime() - b.releasedAt.getTime(),
    );
}

export type LookBackDecision = "stands" | "repeat" | "amend";

export interface LookBackItem {
  id: string;
  decision: LookBackDecision | null;
  decidedBy: string | null;
  decidedAt: Date | null;
}

/** LB-3: one decision per result, recorded with actor and time, set once. */
export function decideLookBack(
  item: LookBackItem,
  d: { decision: LookBackDecision; actorId: string; at: Date },
): { ok: true; item: LookBackItem } | { ok: false; error: "already_decided" } {
  if (item.decision) return { ok: false, error: "already_decided" };
  return {
    ok: true,
    item: { ...item, decision: d.decision, decidedBy: d.actorId, decidedAt: d.at },
  };
}

/** LB-4: "{n} of {m} reviewed"; complete only when every item is decided. */
export function lookBackProgress(items: readonly Pick<LookBackItem, "decision">[]) {
  const decided = items.filter((i) => i.decision !== null).length;
  return { decided, total: items.length, complete: decided === items.length };
}
