/**
 * Flags and critical evaluation (Lab Phase 1, §6.3, rules FL-1 to FL-7; ADR 0241). Pure.
 *
 * In-range bounds are inclusive; a critical limit fires at or beyond it. Only a signed limit in force at
 * the time asked, for this hospital, test, component and unit, and covering the patient's age, is ever
 * used (Law 5). Coded and text results are never auto-flagged.
 */
import type { ResultType } from "@/lib/lab/catalogue";
import type { RangeBand, SignedStatus } from "@/lib/lab/ranges";

import { compareDecimal, isDecimal } from "@/lib/lab/catalogue";
import { inForceAt } from "@/lib/lab/ranges";

export type Flag = "low" | "high" | "normal";

/** FL-1, FL-2: Low below low, High above high, otherwise In range. No band, no flag. */
export function computeFlag(
  value: string,
  band: Pick<RangeBand, "low" | "high"> | null,
): Flag | null {
  if (!band || !isDecimal(value) || (band.low === null && band.high === null)) return null;
  if (band.low !== null && compareDecimal(value, band.low) < 0) return "low";
  if (band.high !== null && compareDecimal(value, band.high) > 0) return "high";
  return "normal";
}

/** FL-3: a manual change keeps the computed flag beside the chosen one, with the reason and the actor. */
export function changeFlag(input: {
  computed: Flag | null;
  chosen: Flag;
  reason: string;
  actorId: string;
}):
  | {
      ok: true;
      flagComputed: Flag | null;
      flagFinal: Flag;
      flagChangeReason: string;
      flagChangedBy: string;
    }
  | { ok: false; reason: "same_flag" | "reason_required" } {
  if (input.chosen === input.computed) return { ok: false, reason: "same_flag" };
  const reason = input.reason.trim();
  if (reason.length < 3) return { ok: false, reason: "reason_required" };
  return {
    ok: true,
    flagComputed: input.computed,
    flagFinal: input.chosen,
    flagChangeReason: reason,
    flagChangedBy: input.actorId,
  };
}

export interface CriticalLimit {
  id: string;
  testId: string;
  conceptId: string;
  unitUcum: string;
  ageFromDays: number | null;
  ageToDays: number | null;
  low: string | null;
  high: string | null;
}

export interface CriticalLimitVersion {
  id: string;
  hospitalId: string;
  version: number;
  status: SignedStatus;
  inForceFrom: Date | null;
  supersededAt: Date | null;
  limits: CriticalLimit[];
}

export type CriticalEvaluation =
  | {
      kind: "critical";
      direction: "low" | "high";
      limitId: string;
      versionId: string;
      version: number;
    }
  | {
      kind: "none";
      reason:
        | "within"
        | "not_numeric"
        | "no_signed_limits"
        | "no_limit_for_test"
        | "no_limit_for_age";
    };

export interface CriticalQuery {
  value: string;
  resultType: ResultType;
  testId: string;
  conceptId: string;
  unitUcum: string | null;
  hospitalId: string;
  ageDays: number | null;
  at: Date;
}

const coversAge = (l: CriticalLimit, days: number | null) =>
  l.ageFromDays === null && l.ageToDays === null
    ? true
    : days !== null &&
      (l.ageFromDays === null || days >= l.ageFromDays) &&
      (l.ageToDays === null || days < l.ageToDays);

/** FL-4 to FL-7: critical low at or below the low limit, critical high at or above the high limit. */
export function evaluateCritical(
  q: CriticalQuery,
  versions: readonly CriticalLimitVersion[],
): CriticalEvaluation {
  if (q.resultType !== "number" || !isDecimal(q.value))
    return { kind: "none", reason: "not_numeric" }; // FL-7
  const set = versions
    .filter((v) => v.hospitalId === q.hospitalId && inForceAt(v, q.at))
    .sort((a, b) => b.version - a.version)[0];
  if (!set) return { kind: "none", reason: "no_signed_limits" };
  // FL-5: a limit in another unit never fires.
  const forTest = set.limits.filter(
    (l) => l.testId === q.testId && l.conceptId === q.conceptId && l.unitUcum === q.unitUcum,
  );
  if (forTest.length === 0) return { kind: "none", reason: "no_limit_for_test" };
  const limit = forTest.find((l) => coversAge(l, q.ageDays));
  if (!limit) return { kind: "none", reason: "no_limit_for_age" }; // FL-6
  const hit = (direction: "low" | "high") => ({
    kind: "critical" as const,
    direction,
    limitId: limit.id,
    versionId: set.id,
    version: set.version,
  });
  if (limit.low !== null && compareDecimal(q.value, limit.low) <= 0) return hit("low");
  if (limit.high !== null && compareDecimal(q.value, limit.high) >= 0) return hit("high");
  return { kind: "none", reason: "within" };
}

/** FL-5 at set-up: limits whose unit is not the component's current unit, shown as errors. */
export function limitUnitErrors(
  limits: readonly CriticalLimit[],
  unitOf: (testId: string, conceptId: string) => string | null,
): string[] {
  return limits.filter((l) => unitOf(l.testId, l.conceptId) !== l.unitUcum).map((l) => l.id);
}

/** The shape checks that make a limits draft unsignable (with FL-5's unit check). */
export function limitSignErrors(
  limits: readonly CriticalLimit[],
  unitOf: (testId: string, conceptId: string) => string | null,
): string[] {
  const errors = limitUnitErrors(limits, unitOf).map((id) => `unit_mismatch:${id}`);
  if (limits.length === 0) errors.push("no_limits");
  for (const l of limits) {
    if (l.low === null && l.high === null) errors.push(`limit_empty:${l.id}`);
    if ((l.low !== null && !isDecimal(l.low)) || (l.high !== null && !isDecimal(l.high)))
      errors.push(`limit_not_decimal:${l.id}`);
    else if (l.low !== null && l.high !== null && compareDecimal(l.low, l.high) >= 0)
      errors.push(`limit_order:${l.id}`);
  }
  const key = (l: CriticalLimit) => `${l.testId}|${l.conceptId}`;
  limits.forEach((a, i) =>
    limits.slice(i + 1).forEach((b) => {
      const lo = (x: CriticalLimit) => x.ageFromDays ?? 0;
      const hi = (x: CriticalLimit) => x.ageToDays ?? Number.POSITIVE_INFINITY;
      if (key(a) === key(b) && lo(a) < hi(b) && lo(b) < hi(a))
        errors.push(`limit_overlap:${a.id}:${b.id}`);
    }),
  );
  return errors;
}
